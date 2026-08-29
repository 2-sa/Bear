import { isWindowsDesktop } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { SettingGroup } from "../kit";
import { ToggleRow } from "../shared";
import { BandwidthInput } from "./bandwidth-section";
import { ChoiceBlock, Tag } from "./choice";
import { DesktopOnlyBlock } from "./internals";
import { HdrModePicker } from "./hdr-mode";
import { DisplayPanelSelector } from "./display-panel-selector";

export function PlayerEnginePanel() {
  const { settings, update } = useSettings();
  const t = useT();

  const choices: Array<{
    id: "auto" | "html5" | "mpv";
    label: string;
    sub: string;
    recommended?: boolean;
  }> = [
    {
      id: "auto",
      label: t("Auto"),
      sub: t("mpv on the desktop app, HTML5 in the browser. The right engine without thinking about it."),
      recommended: true,
    },
    {
      id: "html5",
      label: "HTML5",
      sub: t("Native webview playback. Smooth and integrated, but limited codec coverage."),
    },
    {
      id: "mpv",
      label: "mpv",
      sub: t("Bundled with Bear. Plays anything you throw at it."),
    },
  ];

  return (
    <DesktopOnlyBlock>
      <div className="flex flex-col gap-5">
        <SettingGroup label={t("Engine")}>
          {choices.map((c) => (
            <ChoiceBlock
              key={c.id}
              selected={settings.playerEngine === c.id}
              onClick={() => update({ playerEngine: c.id })}
              label={c.label}
              sub={c.sub}
              tags={c.recommended ? <Tag accent text={t("Recommended")} /> : undefined}
            />
          ))}
          <ToggleRow
            label={t("Embed mpv inside Bear window")}
            sub={t("Renders mpv inline so playback lives in Bear itself. Disable to open it in a separate window instead.")}
            value={settings.playerMpvEmbed}
            onChange={(v) => update({ playerMpvEmbed: v })}
          />
        </SettingGroup>

        {isWindowsDesktop() ? (
          <HdrModePicker />
        ) : (
          <SettingGroup label={t("HDR")}>
            <ToggleRow
              label={t("HDR-to-SDR tonemapping")}
              sub={t("Maps HDR sources to SDR using bt.2446a. Recommended on SDR displays.")}
              value={settings.playerHdrToSdr}
              onChange={(v) => update({ playerHdrToSdr: v })}
            />
            <DisplayPanelSelector />
          </SettingGroup>
        )}

        <SettingGroup label={t("Casting")}>
          <ToggleRow
            label={t("Always re-encode when casting (recommended)")}
            sub={t("On by default. Pipes every cast through ffmpeg as H.264 + AAC + MPEG-TS so Samsung, LG, Sony, and other DLNA TVs accept the stream regardless of source codec. Turn off only if you have a beefy receiver that handles raw HEVC/DTS and want max quality. Requires ffmpeg in PATH.")}
            value={settings.castAlwaysTranscode}
            onChange={(v) => update({ castAlwaysTranscode: v })}
          />
        </SettingGroup>

        <SettingGroup label={t("Connection")}>
          <BandwidthInput />
        </SettingGroup>

        {isWindowsDesktop() && (
          <SettingGroup label={t("Picture")}>
            <ToggleRow
              label={t("Line-free video mode")}
              sub={t("Forces a compatibility present mode that removes a thin bright line some monitors show at the screen edge. Side effects: 4K playback can drop to a slideshow and HDR content looks dimmer (this mode bypasses the HDR display path). Leave OFF unless you see that line. Restart playback to apply.")}
              value={settings.playerD3d11Flip}
              onChange={(v) => update({ playerD3d11Flip: v })}
            />
          </SettingGroup>
        )}
      </div>
    </DesktopOnlyBlock>
  );
}
