import express from "express";

export const embedRouter = express.Router();

function widgetRuntime() {
  const scriptTag = document.currentScript || document.querySelector('script[src*="/embed/dvl-lottery.js"]');
  const API = scriptTag ? new URL(scriptTag.src, window.location.href).origin : "https://dvl-lottery-app.onrender.com";
  const frameParams = new URL(window.location.href).searchParams;
  const CSS_ID = "mff-lottery-widget-css";
  const SHOP_ORIGIN = (() => {
    const explicitShop = frameParams.get("shop");
    try {
      if (explicitShop) return new URL(explicitShop).origin;
      if (document.referrer) return new URL(document.referrer).origin;
      if (window.location.origin !== API) return window.location.origin;
    } catch (_error) {
      return "";
    }
    return "";
  })();

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = `
      .mff-widget,.mff-widget *{box-sizing:border-box}
      .mff-widget{
        --mff-cream:#fff8ed;
        --mff-paper:#fffdf7;
        --mff-ink:#21150f;
        --mff-muted:#765f4d;
        --mff-gold:#efb12c;
        --mff-red:#b72b22;
        --mff-line:#21150f;
        --mff-shadow:#000;
        --mff-soft:#f2dfbc;
        width:100%;
        max-width:100%;
        min-width:0;
        color:var(--mff-ink);
        font-family:Manrope,ui-sans-serif,system-ui,sans-serif;
      }
      .mff-widget :where(p,span,a,button,input){overflow-wrap:anywhere}
      .mff-widget :where(h1,h2,h3,strong){overflow-wrap:normal;word-break:normal}
      .mff-shell{
        position:relative;
        width:100%;
        max-width:100%;
        min-width:0;
        overflow:hidden;
        border:2px solid var(--mff-line);
        border-radius:24px 8px 24px 8px;
        background:linear-gradient(135deg,var(--mff-paper),var(--mff-cream));
        box-shadow:7px 7px 0 var(--mff-shadow);
        padding:clamp(18px,3vw,34px);
      }
      .mff-shell:before{
        content:"";
        position:absolute;
        inset:0;
        z-index:0;
        pointer-events:none;
        background-image:var(--mff-bg-image,none);
        background-position:var(--mff-bg-position,center center);
        background-size:cover;
        background-repeat:no-repeat;
        opacity:var(--mff-bg-opacity,0);
        mix-blend-mode:multiply;
      }
      .mff-shell > *{position:relative;z-index:1}
      .mff-shell--sharp{border-radius:0}
      .mff-shell--soft{border-radius:24px}
      .mff-shell--no-shadow{box-shadow:none}
      .mff-shell--soft-shadow{box-shadow:0 18px 42px rgba(33,21,15,.12)}
      .mff-live-widget{
        overflow:visible;
        margin-bottom:18px;
        border:0;
        border-radius:0;
        background:var(--mff-paper);
        box-shadow:none;
        padding:clamp(30px,5vw,68px) clamp(16px,4vw,54px) clamp(42px,6vw,78px);
      }
      .mff-live-widget:after{
        content:"";
        position:absolute;
        left:0;
        right:0;
        bottom:-18px;
        height:18px;
        z-index:2;
        pointer-events:none;
        background:
          linear-gradient(135deg,var(--mff-paper) 25%,transparent 25%) 0 0/28px 18px repeat-x,
          linear-gradient(225deg,var(--mff-paper) 25%,transparent 25%) 14px 0/28px 18px repeat-x;
      }
      .mff-live-widget .mff-hero{
        max-width:1120px;
        margin:0 auto;
        grid-template-columns:minmax(0,.96fr) minmax(280px,.74fr);
        align-items:center;
      }
      .mff-live-widget .mff-title{
        max-width:620px;
      }
      .mff-live-copy{min-width:0}
      .mff-live-conversion{
        display:grid;
        gap:13px;
        width:min(100%,520px);
        margin-top:clamp(22px,3vw,32px);
      }
      .mff-live-cta{
        min-height:78px;
        display:grid;
        grid-template-columns:minmax(0,1fr) 64px;
        align-items:stretch;
        overflow:hidden;
        border:3px solid #000;
        border-radius:7px;
        background:var(--mff-gold);
        box-shadow:7px 7px 0 #000;
        color:var(--mff-ink);
        text-decoration:none;
        text-transform:uppercase;
        transition:transform 140ms ease,box-shadow 140ms ease;
      }
      .mff-live-cta > span{
        display:grid;
        align-content:center;
        gap:4px;
        min-width:0;
        padding:13px 16px 12px;
      }
      .mff-live-cta small{
        color:color-mix(in srgb,var(--mff-ink) 72%,var(--mff-gold));
        font-size:10px;
        font-weight:950;
        line-height:1.1;
      }
      .mff-live-cta strong{
        font-size:clamp(18px,2.2vw,26px);
        font-weight:950;
        line-height:1;
        letter-spacing:0;
      }
      .mff-live-cta > b{
        display:grid;
        place-items:center;
        border-left:3px solid #000;
        background:var(--mff-ink);
        color:var(--mff-gold);
        font-size:30px;
        line-height:1;
      }
      .mff-live-cta:hover,.mff-live-cta:focus-visible{
        transform:translate(3px,3px);
        box-shadow:4px 4px 0 #000;
        outline:0;
      }
      .mff-live-prize-link{
        width:fit-content;
        display:inline-flex;
        align-items:center;
        gap:9px;
        color:var(--mff-ink);
        font-size:12px;
        font-weight:950;
        line-height:1.2;
        text-decoration-thickness:2px;
        text-underline-offset:5px;
        text-transform:uppercase;
      }
      .mff-live-prize-link span{
        color:var(--mff-red);
        font-size:18px;
        line-height:1;
        transition:transform 140ms ease;
      }
      .mff-live-prize-link:hover span,.mff-live-prize-link:focus-visible span{transform:translateX(3px)}
      .mff-prize-feature{
        position:relative;
        min-height:clamp(260px,34vw,430px);
        display:grid;
        align-items:end;
        overflow:hidden;
        border:2px solid var(--mff-line);
        border-radius:22px 8px 22px 8px;
        background:linear-gradient(145deg,var(--mff-gold),#f5c044);
        box-shadow:7px 7px 0 #000;
        isolation:isolate;
      }
      .mff-prize-feature--image{background:var(--mff-line)}
      .mff-prize-feature__image{
        position:absolute;
        inset:0;
        z-index:0;
      }
      .mff-prize-feature__image img{
        width:100%;
        height:100%;
        display:block;
        object-fit:cover;
        object-position:center;
      }
      .mff-prize-feature__fallback{
        position:absolute;
        inset:0;
        z-index:0;
        display:grid;
        place-items:center;
        padding:26px;
        color:rgba(33,21,15,.1);
        font-size:clamp(64px,10vw,128px);
        font-weight:950;
        line-height:.8;
        text-align:center;
        text-transform:uppercase;
      }
      .mff-prize-feature:after{
        content:"";
        position:absolute;
        inset:0;
        z-index:1;
        background:
          linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.48) 48%,rgba(0,0,0,.18) 100%),
          linear-gradient(180deg,rgba(0,0,0,.12) 0%,rgba(0,0,0,.68) 100%);
        pointer-events:none;
      }
      .mff-prize-feature__copy{
        position:relative;
        z-index:2;
        display:grid;
        align-content:end;
        gap:8px;
        width:min(100%,520px);
        padding:clamp(16px,2.6vw,28px);
        color:#fffdf7;
        text-shadow:none;
      }
      .mff-prize-feature:not(.mff-prize-feature--image) .mff-prize-feature__copy{
        color:var(--mff-ink);
        text-shadow:none;
      }
      .mff-prize-feature:not(.mff-prize-feature--image):after{
        background:linear-gradient(180deg,transparent 0%,rgba(255,253,247,.58) 100%);
      }
      .mff-prize-feature .mff-label{
        display:inline-flex;
        width:max-content;
        max-width:100%;
        align-items:center;
        min-height:28px;
        border:2px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-gold);
        box-shadow:3px 3px 0 var(--mff-shadow);
        padding:0 9px;
        color:var(--mff-ink);
        font-size:10px;
        letter-spacing:0;
        opacity:1;
      }
      .mff-prize-feature .mff-number{
        margin:0;
        color:inherit;
        max-width:11ch;
        font-size:clamp(34px,5vw,62px);
        line-height:.86;
        letter-spacing:0;
        text-shadow:inherit;
      }
      .mff-prize-feature .mff-copy{
        max-width:28ch;
        margin:0;
        color:inherit;
        font-size:clamp(12px,1.25vw,15px);
        font-weight:950;
        line-height:1.18;
        opacity:.95;
      }
      .mff-live-widget .mff-countdown{
        max-width:480px;
      }
      .mff-prize-feature .mff-countdown{
        max-width:100%;
        margin-top:2px;
      }
      .mff-prize-feature .mff-time{
        min-height:58px;
        background:rgba(255,253,247,.94);
        color:var(--mff-ink);
        text-shadow:none;
        box-shadow:0 2px 0 #000;
      }
      .mff-prize-feature .mff-time strong{
        color:var(--mff-ink);
        font-size:clamp(22px,2.8vw,30px);
        letter-spacing:0;
        text-shadow:none;
      }
      .mff-prize-feature .mff-time span{
        color:var(--mff-ink);
        letter-spacing:0;
        opacity:.78;
        text-shadow:none;
      }
      .mff-section{
        position:relative;
        width:100%;
        max-width:100%;
        min-width:0;
        overflow:hidden;
        background:transparent;
        color:var(--mff-ink);
        padding:clamp(22px,4vw,54px);
      }
      .mff-section:before{
        content:"";
        position:absolute;
        inset:0;
        z-index:0;
        pointer-events:none;
        background-image:var(--mff-bg-image,none);
        background-position:var(--mff-bg-position,center center);
        background-size:cover;
        background-repeat:no-repeat;
        opacity:var(--mff-bg-opacity,0);
        mix-blend-mode:multiply;
      }
      .mff-section > *{position:relative;z-index:1}
      .mff-visual{
        width:100%;
        max-height:220px;
        object-fit:contain;
        object-position:center;
        align-self:end;
        filter:drop-shadow(6px 8px 0 var(--mff-shadow));
      }
      .mff-hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr);gap:clamp(16px,3vw,32px);align-items:end}
      .mff-kicker{display:none!important}
      .mff-title{
        margin:0;
        color:var(--mff-ink)!important;
        -webkit-text-fill-color:var(--mff-ink)!important;
        font-size:clamp(38px,6vw,82px);
        font-weight:950;
        line-height:.88;
        letter-spacing:0;
        text-transform:uppercase;
        text-wrap:balance;
        overflow-wrap:normal;
        word-break:normal;
        hyphens:none;
        -webkit-text-stroke:0!important;
        text-shadow:none!important;
      }
      .mff-title--ink{color:var(--mff-ink)!important;-webkit-text-fill-color:var(--mff-ink)!important;-webkit-text-stroke:0!important;text-shadow:none!important}
      .mff-copy{margin:14px 0 0;max-width:720px;color:var(--mff-muted);font-size:clamp(14px,1.4vw,18px);font-weight:850;line-height:1.45}
      .mff-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
      .mff-button,.mff-form button{
        min-height:46px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        border:3px solid var(--mff-line);
        border-radius:18px 7px 18px 7px;
        background:var(--mff-gold);
        color:var(--mff-ink);
        box-shadow:5px 5px 0 var(--mff-shadow);
        padding:0 20px;
        font:inherit;
        font-size:12px;
        font-weight:950;
        line-height:1;
        text-decoration:none;
        text-transform:uppercase;
        cursor:pointer;
        transition:transform 160ms ease,box-shadow 160ms ease;
      }
      .mff-button:hover,.mff-button:focus-visible,.mff-form button:hover,.mff-form button:focus-visible{transform:translate(3px,3px);box-shadow:2px 2px 0 var(--mff-shadow);outline:0}
      .mff-button--red{background:var(--mff-red);color:var(--mff-cream)}
      .mff-button--paper{background:var(--mff-paper);color:var(--mff-ink)}
      .mff-panel{
        border:2px solid var(--mff-line);
        border-radius:22px 8px 22px 8px;
        background:rgba(255,253,247,.86);
        padding:18px;
      }
      .mff-panel--gold{background:var(--mff-gold)}
      .mff-panel--red{background:var(--mff-red);color:var(--mff-cream)}
      .mff-number{display:block;margin-top:4px;font-size:clamp(34px,4.6vw,60px);font-weight:950;line-height:.9;letter-spacing:-.04em}
      .mff-label{display:block;color:inherit;font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;opacity:.76}
      .mff-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
      .mff-mini{min-height:92px;border:2px solid var(--mff-line);border-radius:18px 6px 18px 6px;background:var(--mff-paper);padding:14px}
      .mff-mini strong{display:block;font-size:clamp(20px,2.3vw,34px);font-weight:950;line-height:.95;text-transform:uppercase}
      .mff-mini span{display:block;margin-top:6px;color:var(--mff-muted);font-size:11px;font-weight:950;text-transform:uppercase}
      .mff-progress{height:16px;overflow:hidden;border:2px solid var(--mff-line);border-radius:999px;background:var(--mff-paper);margin-top:14px}
      .mff-progress i{display:block;height:100%;width:var(--progress,0%);background:linear-gradient(90deg,var(--mff-red),var(--mff-gold));transition:width 320ms ease}
      .mff-countdown{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}
      .mff-time{min-height:58px;display:grid;place-items:center;text-align:center;border:2px solid var(--mff-line);border-radius:16px 6px 16px 6px;background:var(--mff-paper)}
      .mff-time strong{font-size:24px;font-weight:950;line-height:1}
      .mff-time span{font-size:9px;font-weight:950;text-transform:uppercase;color:var(--mff-muted)}
      .mff-list{display:grid;gap:10px;margin-top:18px}
      .mff-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 0;font-weight:900}
      .mff-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mff-row b{color:var(--mff-red)}
      .mff-winners-carousel{position:relative;--mff-marquee-height:154px;min-height:var(--mff-marquee-height);max-width:100%;overflow:hidden;margin-top:clamp(20px,3vw,34px)}
      .mff-winners-carousel--compact{--mff-marquee-height:104px;margin-top:18px}
      .mff-winners-track{display:grid;grid-auto-flow:column;grid-auto-columns:min(520px,calc(100% - 18px));gap:clamp(14px,2.5vw,24px);max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-padding-inline:2px;padding:2px 4px 10px 2px;scrollbar-width:none}
      .mff-winners-carousel--compact .mff-winners-track{grid-auto-columns:min(390px,calc(100% - 18px));gap:14px}
      .mff-winners-track--marquee{position:absolute;top:2px;left:0;display:flex;gap:0;width:max-content;max-width:none;overflow:visible;scroll-snap-type:none;scroll-padding-inline:0;scrollbar-width:none;padding:0 0 10px;animation:mffWinnerMarquee var(--mff-winner-speed,32s) linear infinite;will-change:transform}
      .mff-winners-carousel--compact .mff-winners-track--marquee{--mff-winner-speed:24s}
      .mff-winners-carousel:hover .mff-winners-track--marquee,.mff-winners-carousel:focus-within .mff-winners-track--marquee{animation-play-state:paused}
      .mff-winners-group{display:flex;gap:clamp(14px,2.5vw,24px);padding-right:clamp(14px,2.5vw,24px)}
      .mff-winners-carousel--compact .mff-winners-group{gap:14px;padding-right:14px}
      .mff-winners-track::-webkit-scrollbar{display:none}
      .mff-winner{min-width:0;display:flex;align-items:center;gap:14px;scroll-snap-align:start}
      .mff-winners-track--marquee .mff-winner{flex:0 0 min(520px,calc(100vw - 56px))}
      .mff-winners-carousel--compact .mff-winners-track--marquee .mff-winner{flex-basis:min(360px,calc(100vw - 56px))}
      .mff-winner-photo{flex:0 0 auto;width:clamp(74px,8vw,112px);aspect-ratio:1/1;border:2px solid var(--mff-line);border-radius:50%;background:var(--mff-gold);box-shadow:4px 4px 0 var(--mff-shadow);object-fit:cover;object-position:center}
      .mff-winners-carousel--compact .mff-winner-photo{width:64px}
      .mff-winner-copy{min-width:0}
      .mff-winner-initial{display:grid;place-items:center;color:var(--mff-ink);font-size:clamp(26px,3vw,42px);font-weight:950;text-transform:uppercase}
      .mff-winner strong{display:block;color:var(--mff-gold);font-size:clamp(18px,2vw,30px);font-weight:950;line-height:.95;text-transform:uppercase}
      .mff-winners-carousel--compact .mff-winner strong{font-size:16px}
      .mff-winner b{display:block;color:var(--mff-red);font-size:12px;font-weight:950;line-height:1.1;text-transform:uppercase}
      .mff-winner span{display:block;color:var(--mff-muted);font-size:13px;font-weight:850;line-height:1.35}
      .mff-winners-carousel--compact .mff-winner span{font-size:12px}
      .mff-winners-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:18px;color:var(--mff-ink);font-size:12px;font-weight:950;text-transform:uppercase}
      .mff-winners-title span{color:var(--mff-muted);font-size:11px;text-align:right}
      .mff-winner-empty{display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:950}
      .mff-winner-empty b{color:var(--mff-red)}
      @keyframes mffWinnerMarquee{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
      .mff-flow{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(0,1.2fr);gap:clamp(22px,5vw,76px);align-items:center;background:transparent}
      .mff-flow .mff-visual{max-height:170px;margin-top:18px;object-position:left center}
      .mff-steps{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:clamp(12px,2vw,24px);
        min-height:260px;
      }
      .mff-step{
        display:grid;
        gap:8px;
        align-content:space-between;
        padding:clamp(18px,3vw,34px);
        background:transparent;
      }
      .mff-step:first-child{background:transparent}
      .mff-step + .mff-step{padding-left:clamp(18px,3vw,34px)}
      .mff-step i,.mff-proof i,.mff-chip i{
        width:36px;
        height:36px;
        display:grid;
        place-items:center;
        border:2px solid var(--mff-line);
        border-radius:13px 4px 13px 4px;
        background:var(--mff-gold);
        box-shadow:3px 3px 0 var(--mff-shadow);
        color:var(--mff-ink);
        font-style:normal;
        font-weight:950;
        line-height:1;
      }
      .mff-step strong{font-size:clamp(20px,2.4vw,36px);font-weight:950;line-height:.95;text-transform:uppercase}
      .mff-step span{color:var(--mff-muted);font-size:13px;font-weight:850;line-height:1.35}
      .mff-proof-grid{
        display:grid;
        grid-template-columns:minmax(260px,.82fr) minmax(0,1.18fr);
        gap:clamp(20px,4vw,60px);
        align-items:center;
        overflow:hidden;
      }
      .mff-proof-intro{padding:0;background:transparent}
      .mff-proof-intro .mff-title{font-size:clamp(34px,4vw,62px)}
      .mff-proof-board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(14px,2vw,24px);padding-top:clamp(18px,3vw,30px)}
      .mff-proof{
        display:grid;
        grid-template-columns:auto minmax(0,1fr);
        align-items:center;
        column-gap:12px;
        row-gap:4px;
        padding:0 0 clamp(12px,2vw,18px);
        background:transparent;
      }
      .mff-proof i{grid-row:1/3}
      .mff-proof strong{font-size:clamp(20px,2.25vw,34px);font-weight:950;line-height:.92;text-transform:uppercase}
      .mff-proof span{color:var(--mff-muted);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
      .mff-membership{
        display:grid;
        grid-template-columns:minmax(0,.82fr) minmax(320px,1.18fr);
        gap:clamp(18px,4vw,54px);
        align-items:stretch;
        background:transparent;
      }
      .mff-membership-copy{
        min-width:0;
        align-self:center;
      }
      .mff-chip-list{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
      .mff-chip{
        display:inline-flex;
        align-items:center;
        gap:9px;
        border:2px solid var(--mff-line);
        border-radius:14px 5px 14px 5px;
        background:var(--mff-paper);
        box-shadow:4px 4px 0 var(--mff-shadow);
        padding:8px 10px;
        font-size:12px;
        font-weight:950;
        text-transform:uppercase;
      }
      .mff-chip i{width:28px;height:28px;font-size:11px;box-shadow:2px 2px 0 var(--mff-shadow)}
      .mff-chip--account{
        flex:1 0 100%;
        display:grid;
        grid-template-columns:28px minmax(0,1fr) 34px;
        color:var(--mff-paper);
        background:var(--mff-ink);
        border-color:var(--mff-ink);
        box-shadow:5px 5px 0 var(--mff-gold);
        padding:11px 12px;
        text-decoration:none;
        transition:transform 160ms ease,box-shadow 160ms ease;
      }
      .mff-chip--account i{color:var(--mff-ink);background:var(--mff-gold);box-shadow:none}
      .mff-chip--account span{min-width:0;display:grid;gap:2px}
      .mff-chip--account strong{font-size:15px;line-height:1}
      .mff-chip--account small{color:#d9cdbd;font-size:9px;font-weight:900;line-height:1.2;text-transform:uppercase}
      .mff-chip--account b{
        width:34px;
        height:34px;
        display:grid;
        place-items:center;
        border:2px solid var(--mff-paper);
        border-radius:11px 4px 11px 4px;
        color:var(--mff-paper);
        font-size:20px;
        line-height:1;
      }
      .mff-chip--account:hover,.mff-chip--account:focus-visible{transform:translate(3px,3px);box-shadow:2px 2px 0 var(--mff-gold);outline:0}
      .mff-membership-card{
        position:relative;
        min-height:330px;
        display:grid;
        grid-template-rows:minmax(170px,1fr) auto;
        border:3px solid var(--mff-line);
        background:var(--mff-paper);
        box-shadow:10px 10px 0 var(--mff-shadow);
        overflow:hidden;
      }
      .mff-membership-card:after{
        content:"MFF";
        position:absolute;
        right:-18px;
        bottom:-22px;
        color:rgba(33,21,15,.07);
        font-size:clamp(88px,9vw,132px);
        font-weight:950;
        line-height:1;
      }
      .mff-membership-media{
        position:relative;
        min-height:190px;
        overflow:hidden;
        border-bottom:3px solid var(--mff-line);
        background:linear-gradient(135deg,var(--mff-gold),#fff0bd);
      }
      .mff-membership-media img{
        width:100%;
        height:100%;
        min-height:190px;
        display:block;
        object-fit:cover;
        object-position:center;
      }
      .mff-membership-media--fallback{
        display:grid;
        grid-template-columns:1fr .72fr;
        align-items:end;
        gap:0;
        padding:clamp(18px,3vw,30px);
      }
      .mff-membership-pack{
        position:relative;
        z-index:1;
        display:grid;
        gap:8px;
        align-content:end;
      }
      .mff-membership-pack b{
        display:block;
        font-size:clamp(38px,5.8vw,86px);
        font-weight:950;
        line-height:.82;
        text-transform:uppercase;
      }
      .mff-membership-pack span{
        display:inline-flex;
        width:max-content;
        border:2px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-paper);
        box-shadow:3px 3px 0 var(--mff-shadow);
        padding:7px 9px;
        font-size:11px;
        font-weight:950;
        text-transform:uppercase;
      }
      .mff-membership-steak{
        width:min(210px,34vw);
        aspect-ratio:1.16;
        justify-self:end;
        border:3px solid var(--mff-line);
        border-radius:50% 44% 54% 42%;
        background:
          radial-gradient(circle at 34% 45%, #fff4dd 0 9%, transparent 10%),
          radial-gradient(circle at 42% 50%, #8e2b20 0 36%, transparent 37%),
          linear-gradient(135deg,#d95b42,#812319 70%);
        box-shadow:7px 7px 0 var(--mff-shadow);
        transform:rotate(-8deg);
      }
      .mff-membership-content{
        position:relative;
        z-index:1;
        display:grid;
        gap:14px;
        padding:clamp(18px,3vw,30px);
      }
      .mff-membership-card-title{display:block;font-size:clamp(30px,4vw,58px);font-weight:950;line-height:.86;text-transform:uppercase}
      .mff-membership-card-copy{
        max-width:52ch;
        margin:0;
        color:var(--mff-muted);
        font-size:14px;
        font-weight:850;
        line-height:1.4;
      }
      .mff-membership-cta{
        position:relative;
        z-index:2;
        min-height:76px;
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        align-items:center;
        gap:16px;
        border:3px solid var(--mff-line);
        border-radius:22px 7px 22px 7px;
        background:var(--mff-gold);
        box-shadow:7px 7px 0 var(--mff-shadow);
        color:var(--mff-ink);
        padding:14px 16px;
        text-decoration:none;
        transition:transform 160ms ease, box-shadow 160ms ease;
      }
      .mff-membership-cta strong{
        font-size:clamp(24px,3.4vw,44px);
        line-height:.86;
      }
      .mff-membership-cta-copy{
        min-width:0;
      }
      .mff-membership-cta-sub{
        display:block;
        margin-top:5px;
        color:#3b2a1b;
        font-size:11px;
        font-weight:950;
        line-height:1.15;
        text-transform:uppercase;
      }
      .mff-membership-cta i{
        width:44px;
        height:44px;
        display:grid;
        place-items:center;
        border:2px solid var(--mff-line);
        border-radius:15px 5px 15px 5px;
        background:var(--mff-paper);
        box-shadow:3px 3px 0 var(--mff-shadow);
        font-style:normal;
        font-size:24px;
        font-weight:950;
        line-height:1;
      }
      .mff-membership-cta:hover,.mff-membership-cta:focus-visible{
        transform:translate(4px,4px);
        box-shadow:3px 3px 0 var(--mff-shadow);
        outline:0;
      }
      .mff-editorial{
        isolation:isolate;
        display:grid;
        grid-template-columns:minmax(320px,.98fr) minmax(300px,.72fr);
        gap:0;
        align-items:center;
        max-width:1120px;
        margin:0 auto;
        padding:clamp(34px,5vw,68px) clamp(16px,3vw,38px);
      }
      .mff-editorial:after{
        content:"";
        position:absolute;
        z-index:0;
        top:clamp(54px,7vw,88px);
        right:clamp(4px,1.5vw,22px);
        bottom:clamp(28px,4vw,54px);
        left:34%;
        border:3px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-gold);
        box-shadow:8px 8px 0 #000;
      }
      .mff-editorial-copy{
        z-index:3;
        max-width:430px;
        justify-self:end;
        margin-left:clamp(-74px,-5vw,-38px);
        border:3px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-paper);
        box-shadow:6px 6px 0 #000;
        padding:clamp(18px,2.7vw,30px);
      }
      .mff-editorial-label{
        display:inline-flex;
        align-items:center;
        min-height:30px;
        margin-bottom:16px;
        padding:0 10px;
        border:2px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-gold);
        color:var(--mff-ink);
        box-shadow:3px 3px 0 #000;
        font-size:11px;
        font-weight:950;
        line-height:1;
        text-transform:uppercase;
      }
      .mff-editorial .mff-title{
        font-size:clamp(36px,4.45vw,62px);
        line-height:.86;
      }
      .mff-editorial .mff-copy{
        max-width:360px;
        font-size:clamp(14px,1.15vw,16px);
        line-height:1.45;
      }
      .mff-editorial-card{
        position:relative;
        z-index:2;
        height:clamp(310px,32vw,410px);
        min-height:280px;
        max-height:500px;
        border:3px solid var(--mff-line);
        border-radius:10px 4px 10px 4px;
        background:var(--mff-paper);
        box-shadow:10px 10px 0 #000;
        overflow:hidden;
        transform:rotate(-1deg);
      }
      .mff-editorial-card .mff-visual{
        width:100%;
        height:100%;
        max-height:none;
        display:block;
        object-fit:cover;
        object-position:center;
        filter:none;
      }
      .mff-editorial-card--empty{
        display:grid;
        place-items:center;
        padding:22px;
        background:linear-gradient(135deg,var(--mff-gold),var(--mff-soft));
      }
      .mff-editorial-card--empty strong{
        color:var(--mff-ink);
        font-size:clamp(36px,5vw,72px);
        font-weight:950;
        line-height:.88;
        text-align:center;
        text-transform:uppercase;
      }
      .mff-editorial-chip{
        position:absolute;
        left:16px;
        bottom:16px;
        z-index:2;
        display:inline-flex;
        align-items:center;
        min-height:30px;
        max-width:calc(100% - 32px);
        padding:0 10px;
        border:2px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-gold);
        color:var(--mff-ink);
        box-shadow:3px 3px 0 #000;
        font-size:11px;
        font-weight:950;
        line-height:1;
        text-transform:uppercase;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .mff-editorial .mff-actions{
        margin-top:18px;
      }
      .mff-editorial .mff-button{
        min-height:42px;
        border-width:2px;
        border-radius:12px 4px 12px 4px;
        box-shadow:4px 4px 0 #000;
      }
      .mff-form{display:grid;gap:10px;margin-top:20px;max-width:680px}
      .mff-form input{width:100%;min-height:48px;border:2px solid var(--mff-line);border-radius:14px 5px 14px 5px;background:var(--mff-paper);padding:12px 14px;color:var(--mff-ink);font:inherit;font-weight:850}
      .mff-hidden{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important}
      .mff-message{margin-top:12px;color:var(--mff-red);font-weight:900}
      .mff-cart-lines{display:grid;gap:8px;margin-top:12px;color:var(--mff-muted);font-size:13px;font-weight:850}
      .mff-badge{display:inline-flex;width:max-content;align-items:center;gap:8px;border:2px solid var(--mff-line);border-radius:14px 5px 14px 5px;background:var(--mff-gold);padding:8px 11px;color:var(--mff-ink);font-size:11px;font-weight:950;text-transform:uppercase}
      .mff-cart{
        padding:clamp(16px,2.4vw,24px);
      }
      .mff-cart-head{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:14px;
        align-items:start;
      }
      .mff-cart .mff-title{
        font-size:clamp(30px,4vw,54px);
        line-height:.9;
      }
      .mff-cart-reward{
        position:relative;
        display:grid;
        grid-template-columns:auto minmax(0,1fr);
        gap:12px;
        align-items:center;
        margin-top:16px;
        border:2px solid var(--mff-line);
        border-radius:20px 7px 20px 7px;
        background:linear-gradient(135deg,#fff9ec 0%,#ffe3a2 58%,#efb12c 100%);
        box-shadow:5px 5px 0 var(--mff-shadow);
        padding:14px;
        overflow:hidden;
      }
      .mff-cart-reward:before{
        content:"";
        position:absolute;
        inset:-35% auto -35% -28%;
        width:42%;
        transform:skewX(-18deg);
        background:linear-gradient(90deg,transparent,rgba(255,255,255,.68),transparent);
        opacity:0;
      }
      .mff-cart--reached .mff-cart-reward:before{animation:mffRewardSweep 1100ms cubic-bezier(.22,1,.36,1) 160ms 1}
      .mff-reward-medal{
        position:relative;
        width:54px;
        height:54px;
        display:grid;
        place-items:center;
        border:2px solid var(--mff-line);
        border-radius:17px 6px 17px 6px;
        background:var(--mff-paper);
        box-shadow:4px 4px 0 var(--mff-shadow);
        color:var(--mff-red);
        font-size:26px;
        font-weight:950;
        line-height:1;
      }
      .mff-reward-medal:after{
        content:"LOT";
        position:absolute;
        right:-10px;
        bottom:-8px;
        border:2px solid var(--mff-line);
        border-radius:10px 3px 10px 3px;
        background:var(--mff-gold);
        color:var(--mff-ink);
        padding:3px 5px;
        font-size:8px;
        font-weight:950;
      }
      .mff-reward-status{
        min-width:0;
      }
      .mff-reward-status strong{
        display:block;
        color:var(--mff-ink);
        font-size:clamp(18px,2.2vw,30px);
        font-weight:950;
        line-height:.95;
        text-transform:uppercase;
      }
      .mff-reward-status span{
        display:block;
        margin-top:5px;
        color:#4a3324;
        font-size:13px;
        font-weight:900;
        line-height:1.25;
      }
      .mff-cart--reached .mff-progress i{
        background:linear-gradient(90deg,var(--mff-gold),#fff0b9,var(--mff-gold));
        background-size:180% 100%;
        animation:mffRewardBar 1500ms ease-in-out 1;
      }
      .mff-cart-complete{
        display:grid;
        grid-template-columns:auto minmax(0,1fr) auto;
        align-items:center;
        gap:12px;
        border:2px solid var(--mff-line);
        border-radius:18px 6px 18px 6px;
        background:linear-gradient(135deg,#fffdf7 0%,#fff2cf 100%);
        box-shadow:4px 4px 0 var(--mff-shadow);
        padding:12px 13px;
      }
      .mff-cart-complete__icon{
        width:40px;
        height:40px;
        display:grid;
        place-items:center;
        border:2px solid var(--mff-line);
        border-radius:13px 5px 13px 5px;
        background:var(--mff-gold);
        color:var(--mff-ink);
        box-shadow:3px 3px 0 var(--mff-shadow);
        font-size:22px;
        font-weight:950;
        line-height:1;
      }
      .mff-cart-complete strong,
      .mff-cart-complete b{
        display:block;
        color:var(--mff-ink);
        font-size:14px;
        font-weight:950;
        line-height:1;
        text-transform:uppercase;
      }
      .mff-cart-complete em{
        display:block;
        margin-top:4px;
        color:#675847;
        font-size:12px;
        font-style:normal;
        font-weight:850;
        line-height:1.22;
      }
      .mff-cart-complete b{
        color:var(--mff-red);
        white-space:nowrap;
      }
      .mff-cart--reached{
        padding:10px 0;
        border:0;
        background:transparent;
        box-shadow:none;
      }
      .mff-cart--reached .mff-cart-head,
      .mff-cart--reached .mff-cart-reward,
      .mff-cart--reached .mff-progress,
      .mff-cart--reached .mff-cart-lines,
      .mff-cart--reached .mff-actions{
        display:none;
      }
      @keyframes mffRewardSweep{
        0%{opacity:0;transform:translateX(0) skewX(-18deg)}
        20%{opacity:.9}
        100%{opacity:0;transform:translateX(360%) skewX(-18deg)}
      }
      @keyframes mffRewardBar{
        0%{background-position:0 0}
        100%{background-position:180% 0}
      }
      .mff-pdp{
        padding:12px;
        border-width:2px;
        border-radius:14px 5px 14px 5px;
        box-shadow:4px 4px 0 #000;
        background:linear-gradient(135deg,#fffdf7 0%,#fff6e6 100%);
      }
      .mff-pdp-layout{
        display:grid;
        grid-template-columns:auto minmax(0,1fr) auto;
        align-items:center;
        gap:12px;
      }
      .mff-pdp-mark{
        width:38px;
        height:38px;
        display:grid;
        place-items:center;
        flex:0 0 auto;
        border:2px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-gold);
        box-shadow:2px 2px 0 #000;
        color:var(--mff-ink);
        font-size:16px;
        font-weight:950;
        line-height:1;
      }
      .mff-pdp-media{
        width:54px;
        aspect-ratio:1;
        display:grid;
        place-items:center;
        overflow:hidden;
        border:2px solid var(--mff-line);
        border-radius:13px 5px 13px 5px;
        background:#fff7ea;
        color:var(--mff-ink);
        text-decoration:none;
      }
      .mff-pdp-media img,
      .mff-pdp-media span{grid-area:1/1}
      .mff-pdp-media img{width:100%;height:100%;display:block;object-fit:cover}
      .mff-pdp-media span{display:none;font-size:16px;font-weight:950;line-height:1}
      .mff-pdp-media--fallback img{display:none}
      .mff-pdp-media--fallback span{display:grid;width:100%;height:100%;place-items:center;background:var(--mff-gold)}
      .mff-pdp-copy{min-width:0}
      .mff-pdp .mff-kicker{
        margin:0 0 3px;
        font-size:9px;
        letter-spacing:.06em;
      }
      .mff-pdp-product{
        display:block;
        max-width:100%;
        margin-bottom:3px;
        color:#5c4636;
        font-size:11px;
        font-weight:950;
        line-height:1.1;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .mff-pdp .mff-title{
        color:var(--mff-ink);
        font-size:clamp(15px,1.35vw,18px);
        line-height:1;
        -webkit-text-stroke:0;
        text-shadow:none;
      }
      .mff-pdp .mff-copy{
        margin-top:4px;
        max-width:420px;
        font-size:clamp(11px,0.95vw,12px);
        line-height:1.26;
        font-weight:850;
      }
      .mff-pdp .mff-progress{
        height:7px;
        max-width:260px;
        margin-top:7px;
        border-width:2px;
      }
      .mff-pdp-proof{
        display:flex;
        flex-wrap:wrap;
        gap:5px;
        margin-top:8px;
      }
      .mff-pdp-proof span{
        display:inline-flex;
        align-items:center;
        min-height:24px;
        border:1px solid rgba(33,21,15,.34);
        border-radius:999px;
        background:rgba(255,253,247,.78);
        color:#5c4636;
        padding:0 8px;
        font-size:9px;
        font-weight:950;
        text-transform:uppercase;
        white-space:nowrap;
      }
      .mff-pdp-status{
        min-width:112px;
        display:grid;
        gap:4px 8px;
        justify-items:end;
        color:var(--mff-ink);
        font-size:11px;
        font-weight:950;
        line-height:1.05;
        text-align:right;
        text-transform:uppercase;
      }
      .mff-pdp-status strong{
        display:inline-flex;
        align-items:center;
        min-height:30px;
        border:2px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-gold);
        box-shadow:3px 3px 0 #000;
        padding:0 9px;
        color:var(--mff-ink);
      }
      .mff-pdp-status span{
        padding-left:3px;
        color:#5c4636;
        font-size:10px;
        font-weight:900;
      }
      .mff-pdp-actions{
        display:none;
        flex-direction:column;
        align-items:stretch;
        gap:8px;
        min-width:138px;
      }
      .mff-pdp .mff-button{
        min-height:36px;
        width:auto;
        padding:0 13px;
        border-width:2px;
        border-radius:14px 5px 14px 5px;
        box-shadow:3px 3px 0 var(--mff-shadow);
        font-size:10px;
      }
      .mff-pdp .mff-button:hover,.mff-pdp .mff-button:focus-visible{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--mff-shadow)}
      .mff-products{display:grid;gap:20px}
      .mff-products-head{display:flex;align-items:end;justify-content:space-between;gap:16px}
      .mff-products-copy{min-width:0}
      .mff-products .mff-title{font-size:clamp(34px,4.6vw,64px)}
      .mff-products-cues{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}
      .mff-products-cues span{display:inline-flex;align-items:center;min-height:30px;border:2px solid var(--mff-line);border-radius:12px 4px 12px 4px;background:rgba(255,253,247,.82);box-shadow:2px 2px 0 #000;padding:0 10px;color:var(--mff-ink);font-size:10px;font-weight:950;text-transform:uppercase}
      .mff-product-grid{display:flex;gap:12px;overflow-x:auto;overflow-y:visible;scroll-snap-type:x mandatory;padding:0 4px 12px;scrollbar-width:none}
      .mff-product-grid::-webkit-scrollbar{display:none}
      .mff-product-card{min-width:0;flex:0 0 min(292px,78vw);scroll-snap-align:start;display:grid;grid-template-rows:auto minmax(0,1fr);border:2px solid var(--mff-line);border-radius:8px;background:var(--mff-paper);overflow:hidden}
      .mff-product-media{position:relative;aspect-ratio:1/.9;background:linear-gradient(135deg,#fff8ed,#f0e0bf)}
      .mff-product-media img{width:100%;height:100%;display:block;object-fit:cover}
      .mff-product-badge{position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;min-height:28px;max-width:calc(100% - 20px);border:2px solid var(--mff-line);border-radius:12px 4px 12px 4px;background:var(--mff-gold);color:var(--mff-ink);box-shadow:3px 3px 0 #000;padding:0 9px;font-size:11px;font-weight:950;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .mff-product-body{display:grid;gap:12px;align-content:space-between;padding:16px}
      .mff-product-title{display:block;min-height:2.15em;color:var(--mff-ink);font-size:18px;font-weight:950;line-height:1.08;text-transform:uppercase}
      .mff-product-desc{display:none}
      .mff-product-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;color:var(--mff-ink);font-weight:950}
      .mff-product-price strong{color:var(--mff-gold);font-size:19px;line-height:1}
      .mff-product-price s{color:var(--mff-muted);font-size:13px;font-weight:850}
      .mff-product-lot{display:grid;gap:6px}
      .mff-product-lot span{color:var(--mff-muted);font-size:11px;font-weight:900;line-height:1.25}
      .mff-product-lot .mff-progress{height:8px;margin-top:0;border-width:2px}
      .mff-product-actions{display:grid;gap:8px;margin-top:auto}
      .mff-product-actions .mff-button{width:100%;min-height:42px;border-width:2px;border-radius:10px;box-shadow:4px 4px 0 var(--mff-shadow);font-size:10px}
      .mff-product-actions .mff-button--paper{background:var(--mff-paper);box-shadow:none}
      .mff-product-actions .mff-button:hover,.mff-product-actions .mff-button:focus-visible{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--mff-shadow)}
      .mff-product-actions .mff-button--paper:hover,.mff-product-actions .mff-button--paper:focus-visible{box-shadow:none;transform:none}
      .mff-product-message{min-height:16px;color:var(--mff-red);font-size:11px;font-weight:900}
      @media(max-width:760px){
        .mff-shell{padding:16px 14px;border-radius:22px 7px 22px 7px;box-shadow:5px 5px 0 var(--mff-shadow)}
        .mff-live-widget{margin-bottom:16px;border-radius:0;box-shadow:none;padding:28px 14px 48px}
        .mff-live-widget:after{bottom:-16px;height:16px;background-size:24px 16px,24px 16px;background-position:0 0,12px 0}
        .mff-live-widget .mff-hero{grid-template-columns:1fr;gap:24px}
        .mff-live-conversion{margin-top:22px}
        .mff-live-cta{min-height:72px;grid-template-columns:minmax(0,1fr) 58px;box-shadow:6px 6px 0 #000}
        .mff-live-cta > span{padding:12px 13px 11px}
        .mff-live-cta strong{font-size:20px}
        .mff-live-cta > b{font-size:26px}
        .mff-prize-feature{min-height:clamp(250px,72vw,360px)}
        .mff-prize-feature:after{
          background:
            linear-gradient(90deg,rgba(0,0,0,.76) 0%,rgba(0,0,0,.5) 56%,rgba(0,0,0,.2) 100%),
            linear-gradient(180deg,rgba(0,0,0,.08) 0%,rgba(0,0,0,.7) 100%);
        }
        .mff-prize-feature__copy{gap:7px;padding:14px}
        .mff-prize-feature .mff-number{max-width:9.5ch;font-size:clamp(29px,9vw,36px);line-height:.88}
        .mff-prize-feature .mff-copy{font-size:12px}
        .mff-prize-feature .mff-time{min-height:52px}
        .mff-prize-feature .mff-time strong{font-size:22px}
        .mff-live-widget .mff-countdown{grid-template-columns:repeat(2,minmax(0,1fr))}
        .mff-section{padding:22px 14px}
        .mff-hero{grid-template-columns:1fr;gap:14px}
        .mff-title{font-size:clamp(34px,9.4vw,48px);line-height:.92}
        .mff-card-grid{grid-template-columns:1fr}
        .mff-winners-track{grid-auto-columns:100%;gap:18px}
        .mff-winners-track--marquee{display:flex;gap:0}
        .mff-winners-track--marquee .mff-winner{flex-basis:min(330px,calc(100vw - 58px))}
        .mff-winner-photo{width:86px}
        .mff-winners-carousel--compact .mff-winner-photo{width:58px}
        .mff-winner span{font-size:12px}
        .mff-flow{grid-template-columns:1fr;gap:18px}
        .mff-steps{grid-template-columns:1fr;gap:18px}
        .mff-step{min-height:0;padding:16px 0}
        .mff-step,.mff-step + .mff-step{padding-left:0;padding-right:0;background:transparent}
        .mff-step:first-child{background:transparent}
        .mff-proof-grid{grid-template-columns:1fr;gap:16px}
        .mff-proof-board{grid-template-columns:1fr 1fr}
        .mff-proof{border-left:0}
        .mff-membership{grid-template-columns:1fr;background:transparent}
        .mff-membership-card{min-height:0;box-shadow:6px 6px 0 var(--mff-shadow)}
        .mff-membership-media{min-height:180px}
        .mff-membership-media img{min-height:180px}
        .mff-membership-media--fallback{grid-template-columns:1fr;padding:18px}
        .mff-membership-steak{width:150px;justify-self:end;margin-top:-18px}
        .mff-membership-cta{min-height:70px;grid-template-columns:minmax(0,1fr) 40px;box-shadow:5px 5px 0 var(--mff-shadow)}
        .mff-membership-cta strong{font-size:30px}
        .mff-membership-cta i{width:38px;height:38px;font-size:21px}
        .mff-editorial{grid-template-columns:1fr;gap:0;padding:18px 8px 34px}
        .mff-editorial:after{top:128px;right:0;bottom:22px;left:28px;box-shadow:5px 5px 0 #000}
        .mff-editorial-card{height:clamp(205px,58vw,245px);min-height:0;max-height:none;box-shadow:6px 6px 0 #000;transform:none}
        .mff-editorial-copy{max-width:100%;justify-self:stretch;margin:-18px 0 0 18px;padding:17px;box-shadow:5px 5px 0 #000}
        .mff-editorial-label{min-height:28px;margin-bottom:12px;font-size:10px}
        .mff-editorial .mff-title{font-size:clamp(32px,9.2vw,44px)}
        .mff-editorial .mff-copy{font-size:14px}
        .mff-editorial-chip{left:12px;bottom:12px}
        .mff-actions{gap:8px}
        .mff-button,.mff-form button{width:100%}
        .mff-countdown{grid-template-columns:repeat(2,minmax(0,1fr))}
        .mff-cart-head{grid-template-columns:1fr}
        .mff-cart .mff-title{font-size:clamp(26px,9vw,42px)}
        .mff-cart-reward{margin-top:14px;padding:12px;gap:10px}
        .mff-reward-medal{width:48px;height:48px;font-size:23px}
        .mff-reward-status strong{font-size:clamp(17px,5vw,23px)}
        .mff-reward-status span{font-size:12px}
        .mff-pdp{padding:10px;border-radius:14px 5px 14px 5px;box-shadow:4px 4px 0 #000}
        .mff-pdp-layout{grid-template-columns:auto minmax(0,1fr);gap:10px}
        .mff-pdp-media{width:48px}
        .mff-pdp-status{grid-column:1 / -1;grid-template-columns:auto minmax(0,1fr);align-items:center;justify-items:start;text-align:left;column-gap:10px}
        .mff-pdp-status strong{min-height:28px}
        .mff-pdp-actions{display:none}
        .mff-pdp .mff-button{width:100%;min-height:38px}
        .mff-pdp .mff-title{font-size:clamp(15px,4.3vw,18px)}
        .mff-pdp .mff-copy{font-size:11px}
        .mff-pdp-proof{display:none}
        .mff-products-head{display:grid;gap:12px}
        .mff-products-cues{gap:6px;margin-top:10px}
        .mff-products-cues span{min-height:28px;font-size:9px}
        .mff-product-grid{padding-bottom:10px}
        .mff-product-card{flex-basis:min(80vw,310px)}
      }
      @media(prefers-reduced-motion:reduce){.mff-button,.mff-form button,.mff-progress i{transition:none}.mff-cart--reached .mff-cart-reward:before,.mff-cart--reached .mff-progress i,.mff-winners-track--marquee{animation:none}}
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function formatEuro(cents) {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format((Number(cents) || 0) / 100);
  }

  function storeHref(path) {
    return SHOP_ORIGIN ? `${SHOP_ORIGIN}${path}` : path;
  }

  function appAssetHref(path) {
    const raw = String(path || "").trim();
    if (!raw) return "";
    if (raw.startsWith("/assets/") || raw.startsWith("/brand/") || raw.startsWith("/placeholders/")) return `${API}${raw}`;
    return raw;
  }

  function storeAssetHref(filename) {
    return `https://de-vlees-loterij.myshopify.com/cdn/shop/t/6/assets/${encodeURIComponent(filename)}`;
  }

  function widgetCopy(data, key) {
    return data?.widgets?.[key] || {};
  }

  function cssUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "none";
    return `url("${raw.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}")`;
  }

  function visualStyle(copy) {
    const opacity = Math.max(0, Math.min(1, Number(copy.backgroundImageOpacity || 0) / 100));
    return [
      `--mff-cream:${copy.backgroundColor || "#fff8ed"}`,
      `--mff-paper:${copy.surfaceColor || "#fffdf7"}`,
      `--mff-ink:${copy.textColor || "#21150f"}`,
      `--mff-muted:${copy.mutedColor || "#765f4d"}`,
      `--mff-gold:${copy.accentColor || "#efb12c"}`,
      `--mff-red:${copy.secondaryColor || "#b72b22"}`,
      `--mff-line:${copy.borderColor || "#21150f"}`,
      `--mff-bg-image:${cssUrl(copy.backgroundImageUrl)}`,
      `--mff-bg-opacity:${opacity}`,
      `--mff-bg-position:${copy.backgroundImagePosition || "center center"}`
    ].join(";");
  }

  function visualAttrs(copy, extraClass = "") {
    const cornerClass = copy.cornerStyle === "sharp" ? "mff-shell--sharp" : copy.cornerStyle === "soft" ? "mff-shell--soft" : "";
    const shadowClass = copy.shadowStyle === "none" ? "mff-shell--no-shadow" : copy.shadowStyle === "soft" ? "mff-shell--soft-shadow" : "";
    const classes = ["mff-widget", "mff-shell", extraClass, cornerClass, shadowClass].filter(Boolean).join(" ");
    const style = visualStyle(copy);
    return `class="${escapeHtml(classes)}" style="${escapeHtml(style)}"`;
  }

  function sectionAttrs(copy, extraClass = "") {
    const classes = ["mff-widget", "mff-section", extraClass].filter(Boolean).join(" ");
    const style = visualStyle(copy);
    return `class="${escapeHtml(classes)}" style="${escapeHtml(style)}"`;
  }

  function visualImage(copy) {
    const src = appAssetHref(copy.visualImageUrl);
    if (!src) return "";
    return `<img class="mff-visual" src="${escapeHtml(src)}" alt="${escapeHtml(copy.visualImageAlt || "")}" loading="lazy">`;
  }

  function visualImageSrc(copy) {
    return appAssetHref(copy.visualImageUrl);
  }

  function applyFrameCustomizations(data, type) {
    const widget = { ...(data?.widgets?.[type] || {}) };
    const cardImage = frameParams.get("card_image");
    const cardOverlay = frameParams.get("card_overlay");
    const cardPosition = frameParams.get("card_position");
    const contentImage = frameParams.get("content_image");
    const contentAlt = frameParams.get("content_alt");
    if (cardImage) widget.backgroundImageUrl = cardImage;
    if (cardOverlay) widget.backgroundImageOpacity = cardOverlay;
    if (cardPosition) widget.backgroundImagePosition = cardPosition;
    if (contentImage) widget.visualImageUrl = contentImage;
    if (contentAlt) widget.visualImageAlt = contentAlt;
    return {
      ...data,
      widgets: {
        ...(data?.widgets || {}),
        [type]: widget
      }
    };
  }

  function copyText(template, replacements = {}) {
    return String(template == null ? "" : template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => {
      return replacements[token] == null ? "" : String(replacements[token]);
    });
  }

  function nextDrawTimestamp(draw) {
    const explicit = Date.parse(draw?.drawAt || draw?.endsAt || "");
    if (Number.isFinite(explicit)) return explicit;
    return Date.now() + 6 * 86400000 + 20 * 3600000;
  }

  function initCountdowns(root) {
    root.querySelectorAll("[data-mff-countdown]").forEach((countdown) => {
      if (countdown.dataset.bound === "true") return;
      countdown.dataset.bound = "true";
      const target = Number(countdown.dataset.mffCountdown || 0);
      const parts = {
        days: countdown.querySelector('[data-time="days"]'),
        hours: countdown.querySelector('[data-time="hours"]'),
        minutes: countdown.querySelector('[data-time="minutes"]'),
        seconds: countdown.querySelector('[data-time="seconds"]')
      };
      const pad = (value) => String(value).padStart(2, "0");
      const render = () => {
        const diff = Math.max(0, target - Date.now());
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        if (parts.days) parts.days.textContent = pad(days);
        if (parts.hours) parts.hours.textContent = pad(hours);
        if (parts.minutes) parts.minutes.textContent = pad(minutes);
        if (parts.seconds) parts.seconds.textContent = pad(seconds);
      };
      render();
      window.setInterval(render, 1000);
    });
  }

  async function fetchJson(path, options) {
    const response = await fetch(API + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kon data niet laden.");
    return data;
  }

  function trackEvent(widget, action, detail = {}) {
    if (window.DVL_WIDGET_PREVIEW) return;
    const payload = {
      eventType: "widget_event",
      widget,
      action,
      target: detail.target || "",
      value: detail.value || "",
      pageUrl: window.location.href,
      referrer: document.referrer || "",
      shopOrigin: SHOP_ORIGIN || window.location.origin,
      metadata: detail.metadata || {}
    };
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(API + "/api/events", blob)) return;
      }
      fetch(API + "/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true
      }).catch(() => {});
    } catch (_error) {}
  }

  function bindWidgetTracking(el, widget) {
    if (el.dataset.mffTrackingBound === "true") return;
    el.dataset.mffTrackingBound = "true";
    el.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("a,button") : null;
      if (!target) return;
      const productCard = target.closest(".mff-product-card");
      const action = target.closest(".mff-product-media")
        ? "product_open"
        : target.closest("[data-mff-product-form]")
          ? "product_add_attempt"
          : "cta_click";
      trackEvent(widget, action, {
        target: target.getAttribute("href") || target.textContent || "",
        metadata: {
          label: target.textContent || "",
          product: productCard?.querySelector(".mff-product-title")?.textContent || ""
        }
      });
    }, true);
  }

  async function fetchCart() {
    const endpoint = SHOP_ORIGIN ? `${SHOP_ORIGIN}/cart.js` : "/cart.js";
    if (new URL(endpoint, window.location.href).origin === API) {
      throw new Error("Shopify cart alleen beschikbaar op de storefront.");
    }
    const response = await fetch(endpoint, { credentials: "include" });
    if (!response.ok) throw new Error("Winkelwagen niet bereikbaar.");
    return response.json();
  }

  function countdownMarkup(draw) {
    const target = nextDrawTimestamp(draw);
    return `<div class="mff-countdown" data-mff-countdown="${escapeHtml(target)}" aria-label="Volgende trekking">
      <div class="mff-time"><strong data-time="days">00</strong><span>Dagen</span></div>
      <div class="mff-time"><strong data-time="hours">00</strong><span>Uur</span></div>
      <div class="mff-time"><strong data-time="minutes">00</strong><span>Min</span></div>
      <div class="mff-time"><strong data-time="seconds">00</strong><span>Sec</span></div>
    </div>`;
  }

  function sourceLabel(source) {
    const labels = {
      ORDER_THRESHOLD: "Order",
      FREE_ENTRY: "Gratis",
      MANUAL: "Admin",
      SUBSCRIPTION: "Abonnement"
    };
    return labels[source] || source || "Lot";
  }

  function liveWidget(el, data) {
    const copy = widgetCopy(data, "live");
    const draw = data.liveDraw;
    const ruleLabel = data.rule?.label || "1 gratis lot vanaf €70";
    const prizeImage = visualImageSrc(copy);
    const prizeTitle = draw?.prizeName || copy.fallbackPrize || "Vleespakket";
    const prizeMeta = `${draw?.prizeValue || copy.fallbackPrizeValue || "Actieve trekking"} · ${draw?.entryCount ?? 0} loten live`;
    const savedHeading = String(copy.heading || "").trim();
    const savedPrimaryLabel = String(copy.primaryLabel || "").trim();
    const savedSecondaryLabel = String(copy.secondaryLabel || "").trim();
    const genericHeadings = ["pak je lot.", "bestel. pak je lot."];
    const heading = genericHeadings.includes(savedHeading.toLowerCase())
      ? "Je bestelling. Je lot. Jouw kans."
      : (savedHeading || "Je bestelling. Je lot. Jouw kans.");
    const shopLabel = ["", "shop vlees"].includes(savedSecondaryLabel.toLowerCase())
      ? "Shop voor je lot"
      : savedSecondaryLabel;
    const prizeLinkLabel = ["", "bekijk winacties"].includes(savedPrimaryLabel.toLowerCase())
      ? "Bekijk de hoofdprijs"
      : savedPrimaryLabel;
    el.innerHTML = `<section ${visualAttrs(copy, "mff-live-widget")}>
      <div class="mff-hero">
        <div class="mff-live-copy">
          <p class="mff-kicker">${escapeHtml(copy.kicker || "Actieve maandtrekking")}</p>
          <h2 class="mff-title">${escapeHtml(heading)}</h2>
          <p class="mff-copy">${escapeHtml(copyText(copy.body || "Na een geldige bestelling koppelen we je lot automatisch. Volg je deelname en trekking in Mijn MFF.", { rule: ruleLabel }))}</p>
          <div class="mff-live-conversion">
            <a class="mff-live-cta" href="${escapeHtml(storeHref(copy.secondaryUrl || "/collections/all"))}" target="_top">
              <span>
                <small>Kies je vlees</small>
                <strong>${escapeHtml(shopLabel)}</strong>
              </span>
              <b aria-hidden="true">→</b>
            </a>
            <a class="mff-live-prize-link" href="${escapeHtml(storeHref(copy.primaryUrl || "/pages/actieve-loterijen"))}" target="_top">${escapeHtml(prizeLinkLabel)} <span aria-hidden="true">→</span></a>
          </div>
        </div>
        <div class="mff-prize-feature${prizeImage ? " mff-prize-feature--image" : ""}">
          ${prizeImage ? `<div class="mff-prize-feature__image"><img src="${escapeHtml(prizeImage)}" alt="${escapeHtml(copy.visualImageAlt || prizeTitle)}" loading="lazy"></div>` : `<div class="mff-prize-feature__fallback" aria-hidden="true">MFF<br>Prijs</div>`}
          <div class="mff-prize-feature__copy">
            <span class="mff-label">${escapeHtml(copy.prizeLabel || "Hoofdprijs nu")}</span>
            <strong class="mff-number">${escapeHtml(prizeTitle)}</strong>
            <p class="mff-copy">${escapeHtml(prizeMeta)}</p>
            ${countdownMarkup(draw)}
          </div>
        </div>
      </div>
    </section>`;
    initCountdowns(el);
  }

  function cartWidget(el, data) {
    const copy = widgetCopy(data, "cart");
    const threshold = Number(data.rule?.minimumCents || 7000);
    const renderCart = (cart, errorMessage = "") => {
      const total = Number(cart?.total_price || 0);
      const itemCount = Number(cart?.item_count || 0);
      const remaining = Math.max(0, threshold - total);
      const progress = threshold > 0 ? Math.min(100, Math.round((total / threshold) * 100)) : 0;
      const reached = remaining === 0 && itemCount > 0;
      if (reached && el.dataset.mffThresholdTracked !== "true") {
        el.dataset.mffThresholdTracked = "true";
        trackEvent("cart", "cart_threshold_reached", { value: total, metadata: { itemCount, threshold } });
      }
      const statusHeading = reached
        ? (copy.reachedHeading || "Gratis lot unlocked.")
        : itemCount === 0
          ? (copy.emptyHeading || "Pak je gratis lot.")
          : copyText(copy.remainingHeading || "Nog {remaining}", { remaining: formatEuro(remaining) });
      const statusBody = itemCount === 0
        ? copyText(copy.emptyBody || "Je winkelwagen is leeg. Voeg vlees toe en speel mee vanaf {threshold}.", { threshold: formatEuro(threshold) })
        : reached
          ? (copy.reachedBody || "Je bestelling zit boven de grens. Na checkout staat je lot automatisch klaar.")
          : (copy.remainingBody || "Tot je gratis lot bij de actieve winactie.");
      const rewardLabel = reached ? "Gehaald" : itemCount === 0 ? "Vanaf " + formatEuro(threshold) : "Nog " + formatEuro(remaining);
      const rewardText = reached ? "1 gratis lot staat klaar bij checkout." : itemCount === 0 ? "Vul je mandje en speel automatisch mee." : "Voeg nog iets toe en unlock je lot.";
      el.innerHTML = `<section ${visualAttrs(copy, `mff-cart ${reached ? "mff-cart--reached" : ""}`)}>
        ${reached ? `<div class="mff-cart-complete" aria-live="polite">
          <span class="mff-cart-complete__icon" aria-hidden="true">✓</span>
          <span>
            <strong>${escapeHtml(copy.reachedCompactHeading || "Gratis lot actief")}</strong>
            <em>${escapeHtml(copy.reachedCompactBody || "Je lot wordt automatisch gekoppeld bij checkout.")}</em>
          </span>
          <b>${escapeHtml(copy.reachedCompactLabel || "1 lot")}</b>
        </div>` : ""}
        <div class="mff-cart-head">
          <div>
            <span class="mff-badge">${escapeHtml(copy.badge || "Gratis lot")}</span>
            <h2 class="mff-title mff-title--ink">${escapeHtml(statusHeading)}</h2>
            <p class="mff-copy">${escapeHtml(statusBody)}</p>
          </div>
        </div>
        <div class="mff-cart-reward" aria-live="polite">
          <div class="mff-reward-medal" aria-hidden="true">${reached ? "✓" : "1"}</div>
          <div class="mff-reward-status">
            <strong>${escapeHtml(rewardLabel)}</strong>
            <span>${escapeHtml(rewardText)}</span>
          </div>
        </div>
        ${visualImage(copy)}
        <div class="mff-progress" aria-label="Voortgang naar gratis lot" style="--progress:${progress}%"><i></i></div>
        <div class="mff-cart-lines">
          <span>${escapeHtml(copy.cartLabel || "Winkelwagen")}: ${formatEuro(total)}</span>
          <span>${escapeHtml(copy.thresholdLabel || "Drempel")}: ${formatEuro(threshold)}</span>
          ${errorMessage ? `<span>${escapeHtml(errorMessage)}</span>` : ""}
        </div>
        <div class="mff-actions">
          <a class="mff-button" href="${escapeHtml(storeHref(itemCount > 0 ? (copy.primaryUrlFilled || "/checkout") : (copy.primaryUrlEmpty || "/collections/all")))}" target="_top">${escapeHtml(itemCount > 0 ? (copy.primaryLabelFilled || "Afrekenen") : (copy.primaryLabelEmpty || "Shop vlees"))}</a>
          <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.secondaryUrl || "/pages/actieve-loterijen"))}" target="_top">${escapeHtml(copy.secondaryLabel || "Winactie")}</a>
        </div>
      </section>`;
    };
    renderCart({ total_price: 0, item_count: 0 });
    const refresh = async () => {
      try {
        renderCart(await fetchCart());
      } catch (_error) {
        renderCart({ total_price: 0, item_count: 0 }, "Plaats deze cart-widget direct in Shopify zodat hij je winkelwagen kan lezen.");
      }
    };
    refresh();
    const refreshSoon = () => window.setTimeout(refresh, 450);
    [
      "cart:updated",
      "cart:update",
      "cart:refresh",
      "theme:cart:change",
      "ajaxCart:updated",
      "mff:cart-updated",
    ].forEach((eventName) => window.addEventListener(eventName, refresh));
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('form[action*="/cart/add"], [name="add"], [data-add-to-cart], cart-remove-button, [href="/cart"], [href^="/cart?"], .quantity, .cart-item, .cart-drawer')) {
        refreshSoon();
      }
    }, true);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
  }

  function manualWinnerItems(copy) {
    return [
      ["winnerOneName", "winnerOnePrize", "winnerOneStory", "winnerOneImageUrl"],
      ["winnerTwoName", "winnerTwoPrize", "winnerTwoStory", "winnerTwoImageUrl"],
      ["winnerThreeName", "winnerThreePrize", "winnerThreeStory", "winnerThreeImageUrl"],
      ["winnerFourName", "winnerFourPrize", "winnerFourStory", "winnerFourImageUrl"]
    ].map(([nameKey, prizeKey, storyKey, imageKey]) => {
      const name = String(copy[nameKey] || "").trim();
      const prizeName = String(copy[prizeKey] || "").trim();
      const story = String(copy[storyKey] || "").trim();
      const imageUrl = String(copy[imageKey] || "").trim();
      const stalePreview = name === "Voorbeeldwinnaar" || prizeName.toLowerCase().startsWith("voorbeeld ") || story.toLowerCase().startsWith("voorbeeldkaart");
      return { name, prizeName, story, imageUrl, stalePreview };
	    }).filter((winner) => winner.name || winner.prizeName || winner.story || winner.imageUrl);
	  }

  function fallbackWinnerItems() {
    return [
      {
        name: "Youssef",
        prizeName: "Premium vleespakket",
        story: "Niet verwacht dat ik zo snel iets zou winnen. Het pakket kwam perfect uit voor het weekend.",
        imageUrl: storeAssetHref("mff-pexels-premium-steak-board.jpg")
      },
      {
        name: "Daan",
        prizeName: "BBQ pakket",
        story: "Mijn bestelling gaf automatisch een lot en daarna zag ik de winst gewoon terug in Mijn MFF.",
        imageUrl: storeAssetHref("mff-pexels-bbq-table.jpg")
      },
      {
        name: "Nora",
        prizeName: "Vleespakket",
        story: "Ik zag mijn lot meteen na het bestellen. Dat alles zo duidelijk wordt bijgehouden voelt goed.",
        imageUrl: storeAssetHref("mff-pexels-delivery-box.jpg")
      },
      {
        name: "Samir",
        prizeName: "Grill selectie",
        story: "Ik kocht toch al vlees, dus zo'n extra kans maakt bestellen gewoon een stuk leuker.",
        imageUrl: storeAssetHref("mff-pexels-grilled-steak-board.jpg")
      }
    ];
  }

  function winnerInitial(name) {
    return String(name || "MFF winnaar").trim().slice(0, 1).toUpperCase() || "M";
  }

  function winnerPhoto(winner) {
    const src = appAssetHref(winner.imageUrl);
    const name = String(winner.name || "MFF winnaar").trim();
    const fallback = winnerInitial(name);
    if (src) {
      return `<img class="mff-winner-photo" src="${escapeHtml(src)}" alt="${winner.isPlaceholder ? "" : escapeHtml(name + " met prijs")}" loading="lazy" data-mff-winner-fallback="${escapeHtml(fallback)}">`;
    }
    return `<div class="mff-winner-photo mff-winner-initial" aria-hidden="true">${escapeHtml(fallback)}</div>`;
  }

  function displayWinnerName(winner) {
    return String(winner.name || winner.customerName || winner.email || "MFF winnaar").replace(/\s+uit\s+.+$/i, "").trim() || "MFF winnaar";
  }

  function winnerStatement(winner, prize) {
    const raw = String(winner.story || "").trim();
    const clean = raw.replace(/^["“”]+|["“”]+$/g, "");
    const prizeText = prize || "een Meat For Free prijs";
    let statement = clean;
    if (!statement || /^won na zijn/i.test(statement)) {
      statement = `Niet verwacht, maar die ${prizeText} kwam perfect uit.`;
    } else if (/^haar bestelling/i.test(statement)) {
      statement = `Mijn bestelling pakte automatisch een lot en ineens had ik ${prizeText}.`;
    } else if (/^volgde zijn lot/i.test(statement)) {
      statement = `Ik checkte Mijn MFF en zag dat ${prizeText} gewoon van mij was.`;
    } else if (/^pakte met zijn/i.test(statement)) {
      statement = `Nog een order geplaatst en toen stond ${prizeText} op mijn naam.`;
    } else if (!/^ik\b|^niet\b|^mijn\b|^tweede\b|^nog\b/i.test(statement)) {
      statement = `Ik won ${prizeText} met mijn Meat For Free lot.`;
    }
    return `"${statement}"`;
  }

  function winnerCard(winner, duplicate = false) {
    const name = displayWinnerName(winner);
    const prize = winner.prizeName || "Prijs";
    const statement = winnerStatement(winner, prize);
    return `<article class="mff-winner${winner.isPlaceholder ? " mff-winner--placeholder" : ""}"${duplicate ? ' aria-hidden="true"' : ""}>
      ${winnerPhoto({ ...winner, name })}
      <div class="mff-winner-copy">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(statement)}</span>
      </div>
    </article>`;
  }

	  function winnerSet(data, limit = 4) {
	    const copy = widgetCopy(data, "winners");
	    const manualWinners = manualWinnerItems(copy);
	    const automaticWinners = Array.isArray(data.latestWinners) ? data.latestWinners.slice(0, limit) : [];
	    const usableManualWinners = manualWinners.filter((winner) => !winner.stalePreview);
	    const winnerSource = String(copy.winnerSource || "automatic").trim();
	    const selectedWinners = winnerSource === "manual" ? usableManualWinners : automaticWinners;
	    const winners = (selectedWinners.length ? selectedWinners : fallbackWinnerItems()).slice(0, limit);
	    return { copy, winners };
	  }

  function winnerMarquee(winners, compact = false) {
    if (!winners.length) return "";
    const cards = winners.map((winner) => winnerCard(winner)).join("");
    const duplicateCards = winners.map((winner) => winnerCard(winner, true)).join("");
    return `<div class="mff-winners-carousel${compact ? " mff-winners-carousel--compact" : ""}" data-mff-winners-marquee>
      <div class="mff-winners-track mff-winners-track--marquee">
        <div class="mff-winners-group">${cards}</div>
        <div class="mff-winners-group" aria-hidden="true">${duplicateCards}</div>
      </div>
    </div>`;
  }

  function compactWinnersMarkup(data) {
    const { winners } = winnerSet(data, 3);
    if (!winners.length) return "";
    return `<div class="mff-winners-title">
      <strong>Recente winnaars</strong>
    </div>
    ${winnerMarquee(winners, true)}`;
  }

  function setupWinnerPhotos(el) {
    el.querySelectorAll("img.mff-winner-photo[data-mff-winner-fallback]").forEach((img) => {
      img.addEventListener("error", () => {
        const fallback = document.createElement("div");
        fallback.className = "mff-winner-photo mff-winner-initial";
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = img.getAttribute("data-mff-winner-fallback") || "M";
        img.replaceWith(fallback);
      }, { once: true });
    });
  }

  function winnersWidget(el, data) {
    const { copy, winners } = winnerSet(data, 4);
    const savedHeading = String(copy.heading || "").trim();
    const savedBody = String(copy.body || "").trim();
    const staleHeading = ["winnaars komen hier live.", "echte trekkingen."].includes(savedHeading.toLowerCase());
    const staleBody = ["voorbeeld", "zonder lange uitleg", "bewijs boven praatjes"].some((phrase) => savedBody.toLowerCase().includes(phrase));
    const heading = staleHeading ? "Gewonnen met MFF." : (savedHeading || "Gewonnen met MFF.");
    const body = staleBody
      ? "Een selectie uit recente Meat For Free trekkingen."
      : (savedBody || "Een selectie uit recente Meat For Free trekkingen.");
    el.innerHTML = `<section ${visualAttrs(copy)}>
      <p class="mff-kicker">${escapeHtml(copy.kicker || "Winnaars")}</p>
      <h2 class="mff-title mff-title--ink">${escapeHtml(heading)}</h2>
      <p class="mff-copy">${escapeHtml(body)}</p>
      ${visualImage(copy)}
      ${winners.length ? winnerMarquee(winners) : `<div class="mff-winner-empty"><span>${escapeHtml(copy.emptyLabel || "Nog geen winnaars gepubliceerd")}</span><b>${escapeHtml(copy.emptyValue || "Live")}</b></div>`}
    </section>`;
    setupWinnerPhotos(el);
  }

  function renderCustomerDashboard(el, payload) {
    const copy = widgetCopy(payload, "customer");
    const wallet = Array.isArray(payload.ticketWallet) ? payload.ticketWallet.slice(0, 6) : [];
    const winners = Array.isArray(payload.winnerHistory) ? payload.winnerHistory.slice(0, 3) : [];
    const summary = payload.summary || {};
    const draw = payload.activeDraw;
    const nextAction = payload.nextAction || {};
    el.innerHTML = `<section ${visualAttrs(copy)}>
      <div class="mff-hero">
        <div>
          <p class="mff-kicker">${escapeHtml(copy.kicker || "Mijn MFF")}</p>
          <h2 class="mff-title">${escapeHtml(copy.heading || "Je loten. Je trekkingen.")}</h2>
          <p class="mff-copy">${escapeHtml(nextAction.label || copy.loggedInFallback || "Bestel, spaar loten en volg elke trekking transparant.")}</p>
          <div class="mff-progress" aria-label="Voortgang naar volgend lot" style="--progress:${Number(nextAction.progress || 0)}%"><i></i></div>
        </div>
        ${visualImage(copy)}
        <div class="mff-panel">
          <span class="mff-badge">${escapeHtml(draw?.status || copy.panelBadge || "Dashboard")}</span>
          <div class="mff-list">
            <div class="mff-row"><span>Actieve loten</span><b>${escapeHtml(summary.activeEntries ?? 0)}</b></div>
            <div class="mff-row"><span>Live trekking</span><b>${escapeHtml(summary.liveDrawEntries ?? 0)}</b></div>
            <div class="mff-row"><span>Gewonnen</span><b>${escapeHtml(summary.winningEntries ?? 0)}</b></div>
          </div>
        </div>
      </div>
      <div class="mff-card-grid">
        <div class="mff-mini"><strong>${escapeHtml(draw?.prizeName || "Hoofdprijs")}</strong><span>${escapeHtml(draw?.title || "Actieve winactie")}</span></div>
        <div class="mff-mini"><strong>${escapeHtml(summary.totalEntries ?? 0)}</strong><span>Totaal loten</span></div>
        <div class="mff-mini"><strong>${escapeHtml(wallet.length)}</strong><span>In wallet</span></div>
      </div>
      <div class="mff-list">
        ${wallet.length ? wallet.map((entry) => `<div class="mff-row"><span>${escapeHtml(entry.entryNumber)}</span><b>${escapeHtml(sourceLabel(entry.source))}</b></div>`).join("") : `<div class="mff-row"><span>Nog geen actieve loten</span><b>Shop</b></div>`}
        ${winners.length ? winners.map((entry) => `<div class="mff-row"><span>${escapeHtml(entry.entryNumber)}</span><b>Gewonnen</b></div>`).join("") : ""}
      </div>
    </section>`;
  }

  function customerWidget(el, data) {
    const copy = widgetCopy(data, "customer");
    const customerId = el.getAttribute("data-shopify-customer-id") || el.getAttribute("data-customer-id") || "";
    const token = el.getAttribute("data-customer-token") || "";
    if (customerId && token) {
      el.innerHTML = `<section class="mff-widget mff-shell"><p class="mff-kicker">Mijn MFF</p><h2 class="mff-title mff-title--ink">Dashboard laden.</h2></section>`;
      fetchJson(`/api/customers/${encodeURIComponent(customerId)}/entries`, { headers: { "x-dvl-customer-token": token } })
        .then((payload) => renderCustomerDashboard(el, { ...payload, widgets: data.widgets }))
        .catch((error) => {
          el.innerHTML = `<section class="mff-widget mff-shell"><p class="mff-kicker">Mijn MFF</p><h2 class="mff-title mff-title--ink">Log opnieuw in.</h2><p class="mff-copy">${escapeHtml(error.message)}</p></section>`;
        });
      return;
    }
    const draw = data.liveDraw;
    el.innerHTML = `<section ${visualAttrs(copy)}>
      <div class="mff-hero">
        <div>
          <p class="mff-kicker">${escapeHtml(copy.kicker || "Mijn MFF")}</p>
          <h2 class="mff-title">${escapeHtml(copy.heading || "Je loten. Je trekkingen.")}</h2>
          <p class="mff-copy">${escapeHtml(copy.body || "Een rustig dashboard voor actieve loten, gekoppelde orders en winacties.")}</p>
          <div class="mff-actions">
            <a class="mff-button" href="${escapeHtml(storeHref(copy.buttonUrl || "/pages/mijn-mff-dashboard"))}" target="_top">${escapeHtml(copy.buttonLabel || "Open dashboard")}</a>
          </div>
        </div>
        ${visualImage(copy)}
        <div class="mff-panel">
          <span class="mff-badge">${escapeHtml(copy.panelBadge || "Dashboard")}</span>
          <div class="mff-list">
            <div class="mff-row"><span>Loten in live trekking</span><b>${escapeHtml(draw?.entryCount ?? 0)}</b></div>
            <div class="mff-row"><span>Hoofdprijs</span><b>${escapeHtml(draw?.prizeName || "Prijs")}</b></div>
            <div class="mff-row"><span>${escapeHtml(copy.personalLabel || "Persoonlijke loten")}</span><b>${escapeHtml(copy.personalValue || "Na login")}</b></div>
          </div>
        </div>
      </div>
      ${compactWinnersMarkup(data)}
    </section>`;
    setupWinnerPhotos(el);
  }

  function pdpWidget(el, data) {
    const copy = widgetCopy(data, "pdp");
    const threshold = Number(data.rule?.minimumCents || 7000);
    const rawPrice = el.getAttribute("data-product-price-cents") || el.getAttribute("data-price-cents") || "0";
    const productTitle = (el.getAttribute("data-product-title") || "").trim();
    const productImage = appAssetHref(el.getAttribute("data-product-image") || "");
    const productUrl = (el.getAttribute("data-product-url") || "").trim();
    const price = Math.max(0, Number(rawPrice) || 0);
    const remaining = Math.max(0, threshold - price);
    const progress = threshold > 0 ? Math.min(100, Math.round((price / threshold) * 100)) : 0;
    const qualifies = price >= threshold;
    const statusValue = qualifies ? "Lot actief" : `Nog ${formatEuro(remaining)}`;
    const statusLabel = qualifies ? "Bij checkout" : `Van ${formatEuro(threshold)}`;
    const productLine = productTitle ? `<strong class="mff-pdp-product">${escapeHtml(productTitle)}</strong>` : "";
    const proofItems = [copy.proofOne, copy.proofTwo, copy.proofThree].map((item) => String(item || "").trim()).filter(Boolean);
    const media = productImage
      ? `<a class="mff-pdp-media" href="${escapeHtml(storeHref(productUrl || copy.primaryUrl || "/collections/all"))}" target="_top" aria-label="${escapeHtml(productTitle || "Product bekijken")}"><img src="${escapeHtml(productImage)}" alt="${escapeHtml(productTitle || "Meat For Free product")}" loading="lazy"><span aria-hidden="true">1</span></a>`
      : `<div class="mff-pdp-mark" aria-hidden="true">1</div>`;
    el.innerHTML = `<section ${visualAttrs(copy, "mff-pdp")}>
      <div class="mff-pdp-layout">
        ${media}
        <div class="mff-pdp-copy">
          ${productLine}
          <p class="mff-kicker">${escapeHtml(copy.kicker || "Lot bij je bestelling")}</p>
          <h2 class="mff-title">${escapeHtml(qualifies ? (copy.qualifiesHeading || "Gratis lot met dit product.") : (copy.remainingHeading || "Dichter bij je lot."))}</h2>
          <p class="mff-copy">${escapeHtml(qualifies ? (copy.qualifiesBody || "Vanaf checkout automatisch gekoppeld.") : copyText(copy.remainingBody || "Nog {remaining} tot je gratis lot.", { remaining: formatEuro(remaining) }))}</p>
          <div class="mff-progress" aria-label="Productbijdrage naar gratis lot" style="--progress:${progress}%"><i></i></div>
          ${proofItems.length ? `<div class="mff-pdp-proof">${proofItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="mff-pdp-status" aria-label="Lotstatus voor dit product"><strong>${escapeHtml(statusValue)}</strong><span>${escapeHtml(statusLabel)}</span></div>
        <div class="mff-pdp-actions">
          <a class="mff-button" href="${escapeHtml(storeHref(copy.primaryUrl || "/collections/all"))}" target="_top">${escapeHtml(copy.primaryLabel || "Verder shoppen")}</a>
          <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.secondaryUrl || "/pages/actieve-loterijen"))}" target="_top">${escapeHtml(copy.secondaryLabel || "Winactie")}</a>
        </div>
      </div>
    </section>`;
    setupPdpMedia(el);
  }

  function setupPdpMedia(root) {
    root.querySelectorAll(".mff-pdp-media img").forEach((img) => {
      const fallback = () => img.closest(".mff-pdp-media")?.classList.add("mff-pdp-media--fallback");
      img.addEventListener("error", fallback, { once: true });
      if (img.complete && img.naturalWidth === 0) fallback();
    });
  }

  function manualProductCardItems(copy) {
    return [
      ["productOne", "Deal"],
      ["productTwo", "Nieuw"],
      ["productThree", "Populair"],
      ["productFour", "Laatste kans"]
    ].map(([prefix, fallbackTag]) => {
      const title = String(copy[`${prefix}Title`] || "").trim();
      const priceCents = Math.max(0, Number(copy[`${prefix}PriceCents`] || 0) || 0);
      const compareAtCents = Math.max(0, Number(copy[`${prefix}CompareAtCents`] || 0) || 0);
      return {
        title,
        tag: String(copy[`${prefix}Tag`] || fallbackTag || "").trim(),
        description: String(copy[`${prefix}Description`] || "").trim(),
        imageUrl: String(copy[`${prefix}ImageUrl`] || "").trim(),
        url: String(copy[`${prefix}Url`] || copy.collectionUrl || "/collections/all").trim(),
        variantId: String(copy[`${prefix}VariantId`] || "").trim(),
        priceCents,
        compareAtCents
      };
    }).filter((item) => item.title && item.priceCents > 0);
  }

  function productCardItems(copy, data) {
    const synced = Array.isArray(data?.products?.productCards) ? data.products.productCards : [];
    if (copy.productSource !== "manual" && synced.length) {
      return synced.map((item) => ({
        title: String(item.title || "").trim(),
        tag: String(item.tag || "").trim(),
        description: String(item.description || "").trim(),
        imageUrl: String(item.imageUrl || "").trim(),
        url: String(item.url || copy.collectionUrl || "/collections/all").trim(),
        variantId: String(item.variantId || "").trim(),
        priceCents: Math.max(0, Number(item.priceCents || 0) || 0),
        compareAtCents: Math.max(0, Number(item.compareAtCents || 0) || 0),
        available: item.available !== false
      })).filter((item) => item.title && item.priceCents > 0);
    }
    return manualProductCardItems(copy);
  }

  function productBadge(item) {
    if (item.tag) return `<span class="mff-product-badge">${escapeHtml(item.tag)}</span>`;
    if (!item.compareAtCents || item.compareAtCents <= item.priceCents) return "";
    const discount = Math.max(1, Math.round((1 - (item.priceCents / item.compareAtCents)) * 100));
    return `<span class="mff-product-badge">-${discount}%</span>`;
  }

  function productLotMarkup(item, data, structure) {
    if (structure?.showLotProgress === false) return "";
    const threshold = Number(data.rule?.minimumCents || 7000);
    const remaining = Math.max(0, threshold - item.priceCents);
    const progress = threshold > 0 ? Math.min(100, Math.round((item.priceCents / threshold) * 100)) : 0;
    const label = remaining === 0 ? "Pakt een gratis lot bij checkout." : `${formatEuro(remaining)} tot je gratis lot.`;
    return `<div class="mff-product-lot">
      <span>${escapeHtml(data.widgets?.["product-cards"]?.lotLabel || "Telt mee voor je lot")}: ${escapeHtml(label)}</span>
      <div class="mff-progress" aria-label="Productbijdrage richting gratis lot" style="--progress:${progress}%"><i></i></div>
    </div>`;
  }

  async function addVariantToCart(variantId) {
    const endpoint = SHOP_ORIGIN ? `${SHOP_ORIGIN}/cart/add.js` : "/cart/add.js";
    if (new URL(endpoint, window.location.href).origin === API) {
      throw new Error("Direct toevoegen werkt alleen op de Shopify storefront.");
    }
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ id: variantId, quantity: 1 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.description || data.message || "Kon product niet toevoegen.");
    window.dispatchEvent(new CustomEvent("mff:cart-updated", { detail: data }));
    document.dispatchEvent(new CustomEvent("cart:refresh", { detail: data }));
    return data;
  }

  function bindProductCards(el) {
    el.querySelectorAll("[data-mff-product-form]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("button");
        const message = form.closest(".mff-product-card")?.querySelector(".mff-product-message");
        const variantId = form.getAttribute("data-variant-id") || "";
        const original = button?.textContent || "In winkelwagen";
        if (button) {
          button.disabled = true;
          button.textContent = "Toevoegen...";
        }
        if (message) message.textContent = "";
        try {
          await addVariantToCart(variantId);
          trackEvent("product-cards", "product_add_success", { target: variantId });
          if (button) button.textContent = "Toegevoegd";
          if (message) message.textContent = "Toegevoegd aan je winkelwagen.";
          window.setTimeout(() => {
            if (button) {
              button.disabled = false;
              button.textContent = original;
            }
          }, 1200);
        } catch (error) {
          trackEvent("product-cards", "product_add_error", { target: variantId, metadata: { message: error.message } });
          if (button) {
            button.disabled = false;
            button.textContent = original;
          }
          if (message) message.textContent = error.message;
        }
      });
    });
  }

  function productCardsWidget(el, data) {
    const copy = widgetCopy(data, "product-cards");
    const structure = data.siteStructure?.productCards || {};
    const products = productCardItems(copy, data);
    const showSavings = structure.showSavings !== false;
    const showDetails = structure.showDetailsLink !== false;
    const directAdd = structure.directAddEnabled !== false;
    const heading = copy.heading === "Populaire keuzes" ? "Vlees voor pan, grill en BBQ." : (copy.heading || "Vlees voor pan, grill en BBQ.");
    const body = copy.body === "Shop snel met echte Meat For Free producten: prijs, details, winkelwagen en je voortgang naar een gratis lot."
      ? "Kies je cut. Vanaf €70 ontvang je automatisch 1 lot voor de actieve winactie."
      : (copy.body || "Kies je cut. Vanaf €70 ontvang je automatisch 1 lot voor de actieve winactie.");
    const cues = [copy.cueOne, copy.cueTwo, copy.cueThree].map((cue) => String(cue || "").trim()).filter(Boolean);
    el.innerHTML = `<section ${sectionAttrs(copy, "mff-products")}>
      <div class="mff-products-head">
        <div class="mff-products-copy">
          <p class="mff-kicker">Producten</p>
          <h2 class="mff-title mff-title--ink">${escapeHtml(heading)}</h2>
          <p class="mff-copy">${escapeHtml(body)}</p>
          ${cues.length ? `<div class="mff-products-cues">${cues.map((cue) => `<span>${escapeHtml(cue)}</span>`).join("")}</div>` : ""}
        </div>
        <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.collectionUrl || "/collections/all"))}" target="_top">Alles bekijken</a>
      </div>
      <div class="mff-product-grid">
        ${products.map((item) => `<article class="mff-product-card">
          <a class="mff-product-media" href="${escapeHtml(storeHref(item.url))}" target="_top" aria-label="${escapeHtml(item.title)} bekijken">
            ${item.imageUrl ? `<img src="${escapeHtml(appAssetHref(item.imageUrl))}" alt="${escapeHtml(item.title)}" loading="lazy">` : ""}
            ${productBadge(showSavings ? item : { ...item, compareAtCents: 0 })}
          </a>
          <div class="mff-product-body">
            <strong class="mff-product-title">${escapeHtml(item.title)}</strong>
            <div class="mff-product-price">
              <strong>${formatEuro(item.priceCents)}</strong>
              ${showSavings && item.compareAtCents > item.priceCents ? `<s>${formatEuro(item.compareAtCents)}</s>` : ""}
            </div>
            ${productLotMarkup(item, data, structure)}
            <div class="mff-product-actions">
              ${directAdd && item.variantId && item.available !== false
                ? `<form data-mff-product-form data-variant-id="${escapeHtml(item.variantId)}"><button class="mff-button" type="submit">${escapeHtml(copy.cartLabel || "In winkelwagen")}</button></form>`
                : `<a class="mff-button" href="${escapeHtml(storeHref(item.url))}" target="_top">${escapeHtml(copy.soldOutLabel || "Bekijk product")}</a>`}
              ${showDetails ? `<a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(item.url))}" target="_top">${escapeHtml(copy.detailLabel || "Alle gegevens bekijken")}</a>` : ""}
            </div>
            <div class="mff-product-message" aria-live="polite"></div>
          </div>
        </article>`).join("")}
      </div>
    </section>`;
    bindProductCards(el);
  }

  function howItWorksWidget(el, data) {
    const copy = widgetCopy(data, "how-it-works");
    const ruleLabel = data.rule?.label || "1 gratis lot vanaf EUR 70";
    el.innerHTML = `<section ${sectionAttrs(copy, "mff-flow")}>
      <div>
        <p class="mff-kicker">${escapeHtml(copy.kicker || "Zo werkt het")}</p>
        <h2 class="mff-title mff-title--ink">${escapeHtml(copy.heading || "Vlees kopen. Loten sparen.")}</h2>
        <p class="mff-copy">${escapeHtml(copyText(copy.body || "Hou het simpel: bestel goed vlees, ontvang automatisch loten en volg elke trekking in Mijn MFF.", { rule: ruleLabel }))}</p>
        <div class="mff-actions">
          <a class="mff-button" href="${escapeHtml(storeHref(copy.primaryUrl || "/collections/all"))}" target="_top">${escapeHtml(copy.primaryLabel || "Shop vlees")}</a>
          <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.secondaryUrl || "/pages/actieve-loterijen"))}" target="_top">${escapeHtml(copy.secondaryLabel || "Bekijk winacties")}</a>
        </div>
        ${visualImage(copy)}
      </div>
      <div class="mff-steps">
        <div class="mff-step"><i>1</i><strong>${escapeHtml(copy.stepOneTitle || "Bestel vlees")}</strong><span>${escapeHtml(copy.stepOneText || "Vanaf EUR 70 telt je bestelling mee.")}</span></div>
        <div class="mff-step"><i>2</i><strong>${escapeHtml(copy.stepTwoTitle || "Pak je lot")}</strong><span>${escapeHtml(copy.stepTwoText || "Je lot wordt automatisch gekoppeld.")}</span></div>
        <div class="mff-step"><i>3</i><strong>${escapeHtml(copy.stepThreeTitle || "Volg de trekking")}</strong><span>${escapeHtml(copy.stepThreeText || "Alles zichtbaar in Mijn MFF.")}</span></div>
      </div>
    </section>`;
  }

  function trustWidget(el, data) {
    const copy = widgetCopy(data, "trust");
    const proofs = [
      [copy.proofOneValue || "4.8/5", copy.proofOneLabel || "Beoordeling", "★"],
      [copy.proofTwoValue || "Gekoeld", copy.proofTwoLabel || "Vers verpakt", "❄"],
      [copy.proofThreeValue || "NL", copy.proofThreeLabel || "Heldere herkomst", "⌂"],
      [copy.proofFourValue || "Live", copy.proofFourLabel || "Trekkingen", "✓"],
    ];
    el.innerHTML = `<section ${sectionAttrs(copy, "mff-proof-grid")}>
      <div class="mff-proof-intro">
        <p class="mff-kicker">${escapeHtml(copy.kicker || "Waarom MFF")}</p>
        <h2 class="mff-title mff-title--ink">${escapeHtml(copy.heading || "Duidelijk vlees. Eerlijke kansen.")}</h2>
        <p class="mff-copy">${escapeHtml(copy.body || "Minder praat, meer bewijs: gekoeld geleverd, helder verpakt en transparante winacties.")}</p>
        ${visualImage(copy)}
      </div>
      <div class="mff-proof-board">
        ${proofs.map(([value, label, icon]) => `<div class="mff-proof"><i aria-hidden="true">${escapeHtml(icon)}</i><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join("")}
      </div>
    </section>`;
  }

  function membershipWidget(el, data) {
    const copy = widgetCopy(data, "membership");
    const legacyHeading = copy.heading === "Altijd meedoen.";
    const legacyBody = copy.body === "Voor vaste liefhebbers: automatische deelname, betere acties en een dashboard voor je loten.";
    const legacyFeatures = ["Automatische loten", "Vroege toegang", "Clubvoordeel", "Mijn MFF dashboard"];
    const nextFeatures = ["Automatische deelname", "Ledenvoordeel", "Vroege toegang", "Mijn MFF"];
    const savedFeatures = [copy.featureOne, copy.featureTwo, copy.featureThree, copy.featureFour].filter(Boolean);
    const features = savedFeatures.join("|") === legacyFeatures.join("|") ? nextFeatures : (savedFeatures.length ? savedFeatures : nextFeatures);
    const accountLabel = copy.secondaryLabel || "Mijn MFF";
    const accountUrl = copy.secondaryUrl || "/pages/mijn-mff-dashboard";
    const displayedFeatures = [...features.slice(0, 3), accountLabel];
    const imageSrc = visualImageSrc(copy);
    const imageAlt = copy.visualImageAlt || "Meat For Free club";
    const primaryLabel = copy.primaryLabel === "Word lid" ? "Lid worden" : (copy.primaryLabel || "Lid worden");
    const cardTitle = copy.cardTitle || "Altijd erbij";
    const legacyCardText = copy.cardText === "Word lid en laat je deelname automatisch meelopen, met vroege toegang en je eigen MFF overzicht." || copy.cardText === "Je membership laat je automatisch meelopen met geldige acties en houdt alles overzichtelijk in Mijn MFF.";
    const cardText = legacyCardText ? "Je lidmaatschap laat je automatisch meelopen met geldige acties en houdt alles overzichtelijk in Mijn MFF." : (copy.cardText || "Je lidmaatschap laat je automatisch meelopen met geldige acties en houdt alles overzichtelijk in Mijn MFF.");
    const kicker = copy.kicker === "Meat For Free club" ? "MFF Club" : (copy.kicker || "MFF Club");
    const heading = legacyHeading ? "Word lid van de club." : (copy.heading || "Word lid van de club.");
    const body = legacyBody ? "Voor vaste Meat For Free leden: automatische deelname, vroege toegang en ledenvoordeel op acties." : (copy.body || "Voor vaste Meat For Free leden: automatische deelname, vroege toegang en ledenvoordeel op acties.");
    el.innerHTML = `<section ${sectionAttrs(copy, "mff-membership")}>
      <div class="mff-membership-copy">
        <p class="mff-kicker">${escapeHtml(kicker)}</p>
        <h2 class="mff-title mff-title--ink">${escapeHtml(heading)}</h2>
        <p class="mff-copy">${escapeHtml(body)}</p>
        <div class="mff-chip-list">
          ${displayedFeatures.map((feature, index) => index === displayedFeatures.length - 1
            ? `<a class="mff-chip mff-chip--account" href="${escapeHtml(storeHref(accountUrl))}" target="_top"><i>${index + 1}</i><span><strong>${escapeHtml(accountLabel)}</strong><small>Loten, trekkingen en ledenvoordeel</small></span><b aria-hidden="true">&rarr;</b></a>`
            : `<span class="mff-chip"><i>${index + 1}</i>${escapeHtml(feature)}</span>`).join("")}
        </div>
      </div>
      <div class="mff-membership-card">
        <div class="mff-membership-media${imageSrc ? "" : " mff-membership-media--fallback"}">
          ${imageSrc
            ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}" loading="lazy">`
            : `<div class="mff-membership-pack"><span>Club</span><b>MFF<br>Club</b></div><div class="mff-membership-steak" aria-hidden="true"></div>`}
        </div>
        <div class="mff-membership-content">
          <span class="mff-badge">Ledenclub</span>
          <strong class="mff-membership-card-title">${escapeHtml(cardTitle)}</strong>
          <p class="mff-membership-card-copy">${escapeHtml(cardText)}</p>
          <a class="mff-membership-cta" href="${escapeHtml(storeHref(copy.primaryUrl || "/pages/memberships"))}" target="_top">
            <span class="mff-membership-cta-copy"><strong>${escapeHtml(primaryLabel)}</strong><span class="mff-membership-cta-sub">Automatisch meedoen met iedere geldige bestelling.</span></span>
            <i aria-hidden="true">+</i>
          </a>
        </div>
      </div>
    </section>`;
  }

  function communityWidget(el, data) {
    const copy = widgetCopy(data, "community");
    const notes = [copy.noteOne, copy.noteTwo, copy.noteThree].filter(Boolean);
    const image = visualImage(copy);
    const chip = String(notes[0] || copy.kicker || "BBQ gids").trim();
    el.innerHTML = `<section ${sectionAttrs(copy, "mff-editorial")}>
      <div class="mff-editorial-card${image ? "" : " mff-editorial-card--empty"}">
        ${image || `<strong>${escapeHtml(copy.kicker || "BBQ gids")}</strong>`}
        ${chip ? `<span class="mff-editorial-chip">${escapeHtml(chip)}</span>` : ""}
      </div>
      <div class="mff-editorial-copy">
        <span class="mff-editorial-label">${escapeHtml(copy.kicker || "BBQ inspiratie")}</span>
        <p class="mff-kicker">${escapeHtml(copy.kicker || "BBQ inspiratie")}</p>
        <h2 class="mff-title mff-title--ink">${escapeHtml(copy.heading || "Wat zet jij op het vuur?")}</h2>
        <p class="mff-copy">${escapeHtml(copy.body || "Laat recepten, klantfoto's en BBQ challenges zien zonder de shop uit het oog te verliezen.")}</p>
        <div class="mff-actions">
          <a class="mff-button" href="${escapeHtml(storeHref(copy.primaryUrl || "/pages/bbq-inspiratie"))}" target="_top">${escapeHtml(copy.primaryLabel || "Bekijk inspiratie")}</a>
          <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.secondaryUrl || "/pages/community"))}" target="_top">${escapeHtml(copy.secondaryLabel || "Community")}</a>
        </div>
      </div>
    </section>`;
  }

  function freeEntryWidget(el, data) {
    const copy = widgetCopy(data, "free-entry");
    const drawId = data.liveDraw?.id || "";
    el.innerHTML = `<section ${visualAttrs(copy)}>
      <p class="mff-kicker">${escapeHtml(copy.kicker || "Gratis deelname")}</p>
      <h2 class="mff-title mff-title--ink">${escapeHtml(copy.heading || "Een keer gratis meedoen.")}</h2>
      ${visualImage(copy)}
      <form class="mff-form">
        <input name="firstName" autocomplete="given-name" placeholder="${escapeHtml(copy.firstNamePlaceholder || "Voornaam")}">
        <input name="lastName" autocomplete="family-name" placeholder="${escapeHtml(copy.lastNamePlaceholder || "Achternaam")}">
        <input name="email" type="email" autocomplete="email" required placeholder="${escapeHtml(copy.emailPlaceholder || "E-mailadres")}">
        <input class="mff-hidden" name="website" tabindex="-1" autocomplete="off">
        <input name="drawId" type="hidden" value="${escapeHtml(drawId)}">
        <button type="submit">${escapeHtml(copy.buttonLabel || "Vraag gratis lot aan")}</button>
      </form>
      <div class="mff-message" aria-live="polite"></div>
    </section>`;
    const form = el.querySelector("form");
    const message = el.querySelector(".mff-message");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = copy.loadingText || "Aanvraag wordt verwerkt...";
      const payload = Object.fromEntries(new FormData(form).entries());
      trackEvent("free-entry", "free_entry_submit", { target: drawId });
      try {
        const result = await fetchJson("/api/free-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        message.textContent = result.skipped ? (copy.duplicateText || "Je gratis deelname stond al geregistreerd.") : (copy.successPrefix || "Gelukt. Lotnummer:") + " " + result.entry.entryNumber;
        trackEvent("free-entry", "free_entry_success", { target: drawId, metadata: { skipped: Boolean(result.skipped) } });
      } catch (error) {
        message.textContent = error.message;
        trackEvent("free-entry", "free_entry_error", { target: drawId, metadata: { message: error.message } });
      }
    });
  }

  async function render(el) {
    injectStyles();
    el.innerHTML = '<section class="mff-widget mff-shell"><p class="mff-kicker">Laden</p><h2 class="mff-title mff-title--ink">MFF wordt geladen.</h2></section>';
    try {
      const data = await fetchJson("/api/site/summary");
      const type = el.getAttribute("data-dvl-lottery") || "live";
      let nextData = applyFrameCustomizations(data, type);
      const preview = window.DVL_WIDGET_PREVIEW;
      if (preview && preview.key === type && preview.settings && typeof preview.settings === "object") {
        nextData.widgets = { ...(nextData.widgets || {}), [type]: { ...((nextData.widgets || {})[type] || {}), ...preview.settings } };
      }
      const renderers = {
        "free-entry": freeEntryWidget,
        customer: customerWidget,
        cart: cartWidget,
        winners: winnersWidget,
        "product-cards": productCardsWidget,
        pdp: pdpWidget,
        "how-it-works": howItWorksWidget,
        trust: trustWidget,
        membership: membershipWidget,
        community: communityWidget,
        live: liveWidget
      };
      const renderer = renderers[type] || liveWidget;
      renderer(el, nextData);
      bindWidgetTracking(el, renderers[type] ? type : "live");
      trackEvent(renderers[type] ? type : "live", "view", { target: nextData.liveDraw?.id || "" });
    } catch (error) {
      el.innerHTML = '<section class="mff-widget mff-shell"><p class="mff-kicker">Fout</p><h2 class="mff-title mff-title--ink">Niet geladen.</h2><p class="mff-copy">' + escapeHtml(error.message) + '</p></section>';
    }
  }

  const rendered = new WeakSet();
  function init() {
    document.querySelectorAll("[data-dvl-lottery]").forEach((el) => {
      if (rendered.has(el)) return;
      rendered.add(el);
      render(el);
    });
  }

  init();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
  new MutationObserver(init).observe(document.documentElement, { childList: true, subtree: true });
}

const widgetScript = `(${widgetRuntime.toString()})();`;

embedRouter.get("/dvl-lottery.js", (_req, res) => {
  res.setHeader("content-type", "application/javascript; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=30, must-revalidate");
  res.send(widgetScript);
});

embedRouter.get("/demo", (_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meat For Free Lottery Embed Demo</title>
    <style>
      body{margin:0;overflow-x:hidden;background:#fff8ed;color:#21150f;font-family:Manrope,ui-sans-serif,system-ui,sans-serif}
      main{width:min(1180px,calc(100% - 28px));margin:0 auto;padding:28px 0 56px;display:grid;gap:24px}
      h1{margin:0;font-size:clamp(42px,8vw,96px);line-height:.86;text-transform:uppercase}
      p{margin:0;max-width:720px;color:#765f4d;font-weight:850}
    </style>
  </head>
  <body>
    <main>
      <header><h1>MFF embeds</h1><p>Live widgets zoals ze in Shopify kunnen worden geplaatst.</p></header>
      <div data-dvl-lottery="live"></div>
      <div data-dvl-lottery="cart"></div>
      <div data-dvl-lottery="winners"></div>
      <div data-dvl-lottery="product-cards"></div>
      <div data-dvl-lottery="how-it-works"></div>
      <div data-dvl-lottery="trust"></div>
      <div data-dvl-lottery="membership"></div>
      <div data-dvl-lottery="community"></div>
      <div data-dvl-lottery="customer"></div>
      <div data-dvl-lottery="pdp" data-product-price-cents="2549" data-product-title="Ribeye" data-product-image="https://cdn.shopify.com/s/files/1/1075/5814/2291/files/Ribeye-zuid-amerikaanse.webp?v=1780244679" data-product-url="/products/ribeye"></div>
      <div data-dvl-lottery="free-entry"></div>
    </main>
    <script async src="/embed/dvl-lottery.js"></script>
  </body>
</html>`);
});

embedRouter.get("/frame", (req, res) => {
  const allowedWidgets = new Set(["live", "free-entry", "customer", "cart", "winners", "product-cards", "pdp", "how-it-works", "trust", "membership", "community"]);
  const widget = allowedWidgets.has(String(req.query.widget || "")) ? String(req.query.widget) : "live";
  const sectionId = String(req.query.section_id || "");
  const assetVersion = String(req.query.v || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 48);
  const scriptSrc = `/embed/dvl-lottery.js${assetVersion ? `?v=${assetVersion}` : ""}`;
  let previewPayload = null;
  const preview = String(req.query.preview || "");
  if (preview) {
    try {
      const normalized = preview.replaceAll("-", "+").replaceAll("_", "/");
      const decoded = Buffer.from(normalized, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === "object" && parsed.key === widget && parsed.settings && typeof parsed.settings === "object") {
        previewPayload = parsed;
      }
    } catch (_error) {
      previewPayload = null;
    }
  }

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com"
  ].join("; "));
  res.send(`<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meat For Free Lottery ${widget}</title>
    <style>
      html,body{min-height:0;margin:0;overflow:hidden;background:transparent}
      body{width:auto;max-width:100vw;box-sizing:border-box;padding:6px 12px 18px 6px}
      @media(max-width:720px){body{padding:4px 10px 14px 4px}}
    </style>
  </head>
  <body>
    <div data-dvl-lottery="${widget}"></div>
    <script>
      window.DVL_WIDGET_PREVIEW = ${JSON.stringify(previewPayload)};
      (() => {
        const sectionId = ${JSON.stringify(sectionId)};
        const sendHeight = () => {
          const height = Math.max(document.body.scrollHeight, document.body.offsetHeight);
          window.parent.postMessage({ type: "dvl:lottery-frame-height", sectionId, height }, "*");
        };
        window.addEventListener("load", sendHeight);
        window.addEventListener("resize", sendHeight);
        new ResizeObserver(sendHeight).observe(document.body);
        window.setInterval(sendHeight, 1200);
      })();
    </script>
    <script src="${scriptSrc}"></script>
  </body>
</html>`);
});
