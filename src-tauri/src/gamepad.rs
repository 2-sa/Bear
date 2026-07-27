use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use gilrs::{Axis, Button, Event, EventType, GamepadId, Gilrs};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const EVENT_NAME: &str = "gamepad://event";
const DPAD_THRESHOLD: f32 = 0.5;

static GAMEPAD_ENABLED: AtomicBool = AtomicBool::new(true);
static GAMEPADS: OnceLock<Mutex<Vec<GamepadInfo>>> = OnceLock::new();

fn gamepads() -> &'static Mutex<Vec<GamepadInfo>> {
    GAMEPADS.get_or_init(|| Mutex::new(Vec::new()))
}

#[derive(Clone, Serialize)]
pub struct GamepadInfo {
    pub id: u32,
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum GamepadEventPayload {
    Connected {
        id: u32,
        name: String,
    },
    Disconnected {
        id: u32,
    },
    Button {
        id: u32,
        button: &'static str,
        pressed: bool,
    },
    Axis {
        id: u32,
        axis: &'static str,
        value: f32,
    },
}

#[derive(Default, Clone, Copy)]
struct DpadLatch {
    x: i8,
    y: i8,
}

fn numeric_id(id: GamepadId) -> u32 {
    usize::from(id) as u32
}

fn map_button(b: Button) -> Option<&'static str> {
    use Button::*;
    Some(match b {
        South => "south",
        East => "east",
        North => "north",
        West => "west",
        LeftTrigger => "lb",
        RightTrigger => "rb",
        LeftTrigger2 => "lt",
        RightTrigger2 => "rt",
        Start => "start",
        Select => "back",
        Mode => "guide",
        LeftThumb => "lstick",
        RightThumb => "rstick",
        DPadUp => "dup",
        DPadDown => "ddown",
        DPadLeft => "dleft",
        DPadRight => "dright",
        _ => return None,
    })
}

fn map_axis(a: Axis) -> Option<&'static str> {
    use Axis::*;
    Some(match a {
        LeftStickX => "lx",
        LeftStickY => "ly",
        RightStickX => "rx",
        RightStickY => "ry",
        _ => return None,
    })
}

fn emit(app: &AppHandle, payload: GamepadEventPayload) {
    let _ = app.emit(EVENT_NAME, payload);
}

fn emit_input(app: &AppHandle, payload: GamepadEventPayload) {
    if GAMEPAD_ENABLED.load(Ordering::Relaxed) {
        let _ = app.emit(EVENT_NAME, payload);
    }
}

fn upsert(id: u32, name: &str) {
    let mut list = gamepads().lock().unwrap();
    if let Some(entry) = list.iter_mut().find(|g| g.id == id) {
        entry.name = name.to_string();
    } else {
        list.push(GamepadInfo {
            id,
            name: name.to_string(),
        });
    }
}

fn remove(id: u32) {
    gamepads().lock().unwrap().retain(|g| g.id != id);
}

fn axis_direction(value: f32) -> i8 {
    if value > DPAD_THRESHOLD {
        1
    } else if value < -DPAD_THRESHOLD {
        -1
    } else {
        0
    }
}

fn dpad_x(app: &AppHandle, id: u32, value: f32, dpad: &mut HashMap<u32, DpadLatch>) {
    let latch = dpad.entry(id).or_default();
    let want = axis_direction(value);
    if want == latch.x {
        return;
    }
    match latch.x {
        1 => emit_input(
            app,
            GamepadEventPayload::Button {
                id,
                button: "dright",
                pressed: false,
            },
        ),
        -1 => emit_input(
            app,
            GamepadEventPayload::Button {
                id,
                button: "dleft",
                pressed: false,
            },
        ),
        _ => {}
    }
    match want {
        1 => emit_input(
            app,
            GamepadEventPayload::Button {
                id,
                button: "dright",
                pressed: true,
            },
        ),
        -1 => emit_input(
            app,
            GamepadEventPayload::Button {
                id,
                button: "dleft",
                pressed: true,
            },
        ),
        _ => {}
    }
    latch.x = want;
}

fn dpad_y(app: &AppHandle, id: u32, value: f32, dpad: &mut HashMap<u32, DpadLatch>) {
    let latch = dpad.entry(id).or_default();
    let want = axis_direction(value);
    if want == latch.y {
        return;
    }
    match latch.y {
        1 => emit_input(
            app,
            GamepadEventPayload::Button {
                id,
                button: "dup",
                pressed: false,
            },
        ),
        -1 => emit_input(
            app,
            GamepadEventPayload::Button {
                id,
                button: "ddown",
                pressed: false,
            },
        ),
        _ => {}
    }
    match want {
        1 => emit_input(
            app,
            GamepadEventPayload::Button {
                id,
                button: "dup",
                pressed: true,
            },
        ),
        -1 => emit_input(
            app,
            GamepadEventPayload::Button {
                id,
                button: "ddown",
                pressed: true,
            },
        ),
        _ => {}
    }
    latch.y = want;
}

fn handle_event(
    app: &AppHandle,
    gilrs: &Gilrs,
    id: GamepadId,
    event: EventType,
    dpad: &mut HashMap<u32, DpadLatch>,
) {
    let gid = numeric_id(id);
    match event {
        EventType::Connected => {
            let name = gilrs.gamepad(id).name().to_string();
            upsert(gid, &name);
            emit(app, GamepadEventPayload::Connected { id: gid, name });
        }
        EventType::Disconnected => {
            remove(gid);
            dpad.remove(&gid);
            emit(app, GamepadEventPayload::Disconnected { id: gid });
        }
        EventType::ButtonPressed(btn, _) => {
            if let Some(button) = map_button(btn) {
                emit_input(
                    app,
                    GamepadEventPayload::Button {
                        id: gid,
                        button,
                        pressed: true,
                    },
                );
            }
        }
        EventType::ButtonReleased(btn, _) => {
            if let Some(button) = map_button(btn) {
                emit_input(
                    app,
                    GamepadEventPayload::Button {
                        id: gid,
                        button,
                        pressed: false,
                    },
                );
            }
        }
        EventType::AxisChanged(axis, value, _) => match axis {
            Axis::DPadX => dpad_x(app, gid, value, dpad),
            Axis::DPadY => dpad_y(app, gid, value, dpad),
            other => {
                if let Some(axis) = map_axis(other) {
                    emit_input(
                        app,
                        GamepadEventPayload::Axis {
                            id: gid,
                            axis,
                            value,
                        },
                    );
                }
            }
        },
        _ => {}
    }
}

fn seed(gilrs: &Gilrs) {
    let mut list = gamepads().lock().unwrap();
    list.clear();
    for (id, pad) in gilrs.gamepads() {
        list.push(GamepadInfo {
            id: numeric_id(id),
            name: pad.name().to_string(),
        });
    }
}

fn run(app: AppHandle) {
    let mut gilrs = match Gilrs::new() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("[harbor::gamepad] init failed: {e}");
            return;
        }
    };
    seed(&gilrs);
    let mut dpad: HashMap<u32, DpadLatch> = HashMap::new();
    loop {
        while let Some(Event { id, event, .. }) = gilrs.next_event() {
            handle_event(&app, &gilrs, id, event, &mut dpad);
        }
        std::thread::sleep(Duration::from_millis(8));
    }
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || run(app));
}

#[tauri::command]
pub fn gamepad_list() -> Vec<GamepadInfo> {
    gamepads().lock().map(|g| g.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn gamepad_set_enabled(enabled: bool) {
    GAMEPAD_ENABLED.store(enabled, Ordering::SeqCst);
}
