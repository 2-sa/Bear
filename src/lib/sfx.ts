// src/lib/sfx.ts

class SoundEffects {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private muted = false;

  private activeTheme:
    | 'none'
    | 'glass'
    | 'modern'
    | 'retro'
    | 'cinematic'
    | 'cloudy' = 'glass';

  private currentVolume = 0.5;


  public setTheme(
    theme:
      | 'none'
      | 'glass'
      | 'modern'
      | 'retro'
      | 'cinematic'
      | 'cloudy'
  ) {
    this.activeTheme = theme;
  }


  public setVolume(vol: number) {

    this.currentVolume = Math.max(
      0,
      Math.min(1, vol)
    );


    if (!this.masterGain || !this.ctx) {
      return;
    }


    const now = this.ctx.currentTime;


    this.masterGain.gain.cancelScheduledValues(now);


    this.masterGain.gain.setValueAtTime(
      this.masterGain.gain.value,
      now
    );


    this.masterGain.gain.linearRampToValueAtTime(
      this.muted ? 0 : this.currentVolume,
      now + 0.05
    );
  }



  private getCtx() {

    if (typeof window === "undefined") {
      return null;
    }


    if (!this.ctx) {

      this.ctx = new (
        window.AudioContext ||
        (window as any).webkitAudioContext
      )();



      this.masterGain = this.ctx.createGain();

      this.masterGain.gain.setValueAtTime(
        this.currentVolume,
        this.ctx.currentTime
      );



      this.compressor =
        this.ctx.createDynamicsCompressor();


      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 20;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.02;
      this.compressor.release.value = 0.3;



      this.masterGain
        .connect(this.compressor)
        .connect(this.ctx.destination);
    }



    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }


    return this.ctx;
  }



  private playTone(
    freq: number,
    type: OscillatorType,
    dur: number,
    vol: number,
    glideTo?: number
  ) {

    if (this.muted) return;


    const c = this.getCtx();

    if (!c || !this.masterGain) return;


    const t = c.currentTime;


    const osc = c.createOscillator();
    const gain = c.createGain();



    osc.type = type;


    osc.frequency.setValueAtTime(
      freq,
      t
    );


    if (glideTo) {

      osc.frequency.exponentialRampToValueAtTime(
        glideTo,
        t + dur
      );

    }



    gain.gain.setValueAtTime(
      0.0001,
      t
    );


    gain.gain.exponentialRampToValueAtTime(
      vol,
      t + 0.02
    );


    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      t + dur
    );



    osc
      .connect(gain)
      .connect(this.masterGain);



    osc.start(t);

    osc.stop(
      t + dur + 0.02
    );
  }




  private playGlass({
    freq = 880,
    dur = 0.5,
    vol = 0.03,
    modRatio = 2.76,
    modDepth = 6
  }) {


    if (this.muted) return;


    const c = this.getCtx();

    if (!c || !this.masterGain) return;


    const t = c.currentTime;



    const carrier = c.createOscillator();
    const modulator = c.createOscillator();

    const modGain = c.createGain();
    const filter = c.createBiquadFilter();
    const amp = c.createGain();



    carrier.type = "sine";

    carrier.frequency.setValueAtTime(
      freq,
      t
    );


    modulator.type = "sine";

    modulator.frequency.setValueAtTime(
      freq * modRatio,
      t
    );



    modGain.gain.setValueAtTime(
      modDepth,
      t
    );


    modGain.gain.exponentialRampToValueAtTime(
      0.01,
      t + dur
    );



    modulator
      .connect(modGain)
      .connect(carrier.frequency);



    filter.type = "lowpass";

    filter.frequency.value = 6500;



    amp.gain.setValueAtTime(
      0.0001,
      t
    );


    amp.gain.exponentialRampToValueAtTime(
      vol,
      t + 0.01
    );


    amp.gain.exponentialRampToValueAtTime(
      0.0001,
      t + dur
    );



    carrier
      .connect(filter)
      .connect(amp)
      .connect(this.masterGain);



    carrier.start(t);
    modulator.start(t);


    carrier.stop(t + dur);
    modulator.stop(t + dur);
  }
  navigate(
    dir: "up" | "down" | "left" | "right"
  ) {

    if (this.activeTheme === "none") return;


    const isUp = dir === "up";
    const isDown = dir === "down";



    if (this.activeTheme === "cloudy") {

      this.playTone(
        isDown ? 1300 : isUp ? 1700 : 1500,
        "sine",
        0.04,
        0.012,
        isDown ? 1500 : 1800
      );

      return;
    }



    if (this.activeTheme === "cinematic") {

      this.playTone(
        isDown ? 160 : isUp ? 230 : 200,
        "sine",
        0.12,
        0.01
      );

      return;
    }



    if (this.activeTheme === "retro") {

      this.playTone(
        isDown ? 600 : isUp ? 780 : 700,
        "triangle",
        0.035,
        0.007
      );
    
      return;
    }



    if (this.activeTheme === "modern") {

      this.playTone(
        isDown ? 380 : isUp ? 460 : 420,
        "sine",
        0.03,
        0.03
      );

      return;
    }



    if (this.activeTheme === "glass") {

      this.playGlass({
        freq: isDown ? 1800 : isUp ? 2200 : 2000,
        dur: 0.08,
        vol: 0.012
      });

    }

  }





  open() {

    if (this.activeTheme === "none") return;



    if (this.activeTheme === "cloudy") {

      this.playTone(
        300,
        "sine",
        0.15,
        0.03,
        1200
      );

      this.playTone(
        600,
        "sine",
        0.18,
        0.015,
        1500
      );

      return;
    }




    if (this.activeTheme === "cinematic") {


      const c = this.getCtx();

      if (!c || !this.masterGain) return;


      const t = c.currentTime;



      const bass = c.createOscillator();

      const bassGain = c.createGain();



      bass.type = "sine";


      bass.frequency.setValueAtTime(
        100,
        t
      );


      bass.frequency.exponentialRampToValueAtTime(
        35,
        t + 0.35
      );



      bassGain.gain.setValueAtTime(
        0.0001,
        t
      );


      bassGain.gain.exponentialRampToValueAtTime(
        0.06,
        t + 0.04
      );


      bassGain.gain.exponentialRampToValueAtTime(
        0.001,
        t + 1.2
      );



      bass
        .connect(bassGain)
        .connect(this.masterGain);



      bass.start(t);
      bass.stop(t + 1.3);




      const shimmer = c.createOscillator();

      const shimmerGain = c.createGain();



      shimmer.type = "sine";


      shimmer.frequency.value = 900;



      shimmerGain.gain.setValueAtTime(
        0.0001,
        t
      );


      shimmerGain.gain.exponentialRampToValueAtTime(
        0.012,
        t + 0.05
      );


      shimmerGain.gain.exponentialRampToValueAtTime(
        0.0001,
        t + 0.5
      );



      shimmer
        .connect(shimmerGain)
        .connect(this.masterGain);



      shimmer.start(t);
      shimmer.stop(t + 0.6);


      return;
    }





    if (this.activeTheme === "retro") {

      this.playTone(
        523,
        "triangle",
        0.06,
        0.012
      );
      
      
      setTimeout(() => {
      
        this.playTone(
          659,
          "triangle",
          0.08,
          0.01
        );
      
      }, 35);


      return;
    }




    if (this.activeTheme === "modern") {

      this.playTone(
        523,
        "sine",
        0.25,
        0.025
      );


      this.playTone(
        659,
        "sine",
        0.25,
        0.02
      );


      return;
    }




    if (this.activeTheme === "glass") {

      this.playGlass({
        freq: 720,
        dur: 0.5,
        vol: 0.035,
        modRatio: 3
      });

    }

  }






  close() {


    if (this.activeTheme === "none") return;



    if (this.activeTheme === "cloudy") {

      this.playTone(
        850,
        "sine",
        0.12,
        0.015,
        300
      );

      return;
    }




    if (this.activeTheme === "cinematic") {

      this.playTone(
        100,
        "sine",
        0.35,
        0.02,
        60
      );

      return;
    }




    if (this.activeTheme === "retro") {

      this.playTone(
        560,
        "triangle",
        0.05,
        0.01,
        420
      );
      
      
      setTimeout(() => {
      
        this.playTone(
          430,
          "triangle",
          0.06,
          0.008
        );
      
      }, 35);


      return;
    }




    if (this.activeTheme === "glass") {

      this.playGlass({
        freq: 560,
        dur: 0.25,
        vol: 0.025
      });

    }



    else if (this.activeTheme === "modern") {

      this.playTone(
        330,
        "sine",
        0.2,
        0.02
      );

    }

  }
  hover() {

    if (this.activeTheme === "none") return;



    if (this.activeTheme === "cloudy") {

      this.playTone(
        1800,
        "sine",
        0.02,
        0.008
      );

      return;
    }



    if (this.activeTheme === "retro") {

      this.playTone(
        850,
        "triangle",
        0.025,
        0.006,
        950
      );
    
      return;
    }




    if (this.activeTheme === "glass") {

      this.playGlass({
        freq: 2200,
        dur: 0.05,
        vol: 0.012
      });

      return;
    }





    if (this.activeTheme === "modern") {

      
      this.playTone(
        780,
        "sine",
        0.016,
        0.007,
        840
      );

      return;
    }





    if (this.activeTheme === "cinematic") {

      const c = this.getCtx();

      if (!c || !this.masterGain) return;


      const t = c.currentTime;


      const osc = c.createOscillator();
      const gain = c.createGain();



      osc.type = "sine";

      osc.frequency.setValueAtTime(
        180,
        t
      );


      osc.frequency.exponentialRampToValueAtTime(
        260,
        t + 0.08
      );



      gain.gain.setValueAtTime(
        0.0001,
        t
      );


      gain.gain.exponentialRampToValueAtTime(
        0.02,
        t + 0.015
      );


      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        t + 0.12
      );



      osc
        .connect(gain)
        .connect(this.masterGain);



      osc.start(t);
      osc.stop(t + 0.15);

    }

  }






  click() {

    if (this.activeTheme === "none") return;



    if (this.activeTheme === "cloudy") {

      this.playTone(
        1000,
        "sine",
        0.06,
        0.02,
        400
      );

      return;
    }




    if (this.activeTheme === "retro") {

      this.playTone(
        520,
        "triangle",
        0.05,
        0.01,
        650
      );

      return;
    }




    if (this.activeTheme === "glass") {

      this.playGlass({
        freq: 1500,
        dur: 0.08,
        vol: 0.03
      });

      return;
    }




    if (this.activeTheme === "modern") {

      this.playTone(
        400,
        "sine",
        0.05,
        0.025
      );

      return;
    }




    if (this.activeTheme === "cinematic") {

      this.playTone(
        180,
        "sine",
        0.12,
        0.02,
        130
      );

    }

  }






  back() {

    if (this.activeTheme === "none") return;



    if (this.activeTheme === "glass") {

      this.playGlass({
        freq: 420,
        dur: 0.25,
        vol: 0.02
      });

    }



    else if (this.activeTheme === "modern") {

      this.playTone(
        300,
        "sine",
        0.15,
        0.015,
        220
      );

    }



    else if (this.activeTheme === "cloudy") {

      this.playTone(
        700,
        "sine",
        0.12,
        0.012,
        350
      );

    }



    else if (this.activeTheme === "retro") {

      this.playTone(
        500,
        "triangle",
        0.08,
        0.01,
        300
      );

    }



    else if (this.activeTheme === "cinematic") {

      this.playTone(
        120,
        "sine",
        0.25,
        0.02,
        70
      );

    }

  }





  volumeChange(isUp: boolean) {
    if (this.activeTheme === 'none') return;
    
    if (this.activeTheme === 'cloudy') {
      
      this.playTone(isUp ? 1200 : 800, 'sine', 0.04, 0.015, isUp ? 1400 : 600);
    } 
    else if (this.activeTheme === 'retro') {
      
      this.playTone(
        isUp ? 820 : 620,
        'triangle',
        0.04,
        0.008
      );
    } 
    else if (this.activeTheme === 'cinematic') {
      this.playTone(
        isUp ? 180 : 120,
        'sine',
        0.12,
        0.018,
        isUp ? 220 : 90
      );
    } 
    else if (this.activeTheme === 'modern') {
      
      this.playTone(isUp ? 600 : 450, 'sine', 0.02, 0.02);
    } 
    else if (this.activeTheme === 'glass') {
      
      this.playGlass({ freq: isUp ? 1500 : 1100, dur: 0.1, vol: 0.015 });
    }
  }

  
  playbackToggle(isPlay: boolean) {
    if (this.activeTheme === 'none') return;
    
    if (this.activeTheme === 'cloudy') {
      this.playTone(isPlay ? 600 : 800, 'sine', 0.08, 0.02, isPlay ? 1200 : 400);
    } 
    else if (this.activeTheme === 'retro') {
      this.playTone(isPlay ? 440 : 660, 'triangle', 0.06, 0.015);
      setTimeout(() => this.playTone(isPlay ? 660 : 440, 'triangle', 0.08, 0.015), 60);
    } 
    else if (this.activeTheme === 'cinematic') {
      this.playTone(isPlay ? 180 : 100, 'sine', 0.15, 0.04);
    } 
    else if (this.activeTheme === 'modern') {
      this.playTone(isPlay ? 520 : 400, 'sine', 0.05, 0.03);
    } 
    else if (this.activeTheme === 'glass') {
      this.playGlass({ freq: isPlay ? 1200 : 700, dur: 0.15, vol: 0.03 });
    }
  }

  setMuted(muted: boolean) {

    this.muted = muted;


    if (!this.masterGain) return;


    this.masterGain.gain.value =
      muted ? 0 : this.currentVolume;

  }







  init() {

    if (this.activeTheme === "none") return;


    this.getCtx();

  }

}



export const SFX = new SoundEffects();