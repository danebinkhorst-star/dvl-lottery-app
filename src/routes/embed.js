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
      .mff-winner strong{display:block;color:var(--mff-ink);font-size:clamp(18px,2vw,30px);font-weight:950;line-height:.95;text-transform:uppercase}
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
        grid-template-columns:minmax(0,.9fr) minmax(280px,1.1fr);
        gap:clamp(24px,5vw,72px);
        align-items:center;
        background:transparent;
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
      .mff-ticket{
        position:relative;
        min-height:300px;
        border:3px solid var(--mff-line);
        border-radius:0;
        background:var(--mff-paper);
        box-shadow:10px 10px 0 var(--mff-shadow);
        padding:clamp(18px,3vw,30px);
        overflow:hidden;
      }
      .mff-ticket:after{
        content:"MFF";
        position:absolute;
        right:-18px;
        bottom:-22px;
        color:rgba(33,21,15,.08);
        font-size:112px;
        font-weight:950;
        line-height:1;
      }
      .mff-ticket strong{position:relative;z-index:1;display:block;font-size:clamp(34px,5vw,72px);font-weight:950;line-height:.84;text-transform:uppercase}
      .mff-editorial{
        display:grid;
        grid-template-columns:minmax(220px,.7fr) minmax(0,1.3fr);
        gap:clamp(24px,5vw,72px);
        align-items:center;
      }
      .mff-editorial-rail{
        display:grid;
        grid-template-columns:1.15fr .85fr;
        grid-auto-rows:minmax(150px,1fr);
        gap:0;
        border:3px solid var(--mff-line);
        background:var(--mff-paper);
      }
      .mff-note{
        min-height:170px;
        display:flex;
        align-items:flex-end;
        background:transparent;
        box-shadow:none;
        padding:clamp(16px,2vw,24px);
        color:var(--mff-ink);
        font-size:clamp(22px,3vw,44px);
        font-weight:950;
        line-height:.95;
        text-transform:uppercase;
        overflow:hidden;
        overflow-wrap:anywhere;
      }
      .mff-note:first-child{grid-row:span 2;background:var(--mff-gold)}
      .mff-editorial-rail .mff-visual{
        grid-row:span 2;
        width:100%;
        height:100%;
        min-height:340px;
        max-height:none;
        object-fit:cover;
        filter:none;
        background:var(--mff-gold);
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
        padding:10px 11px;
        border-width:2px;
        border-radius:14px 5px 14px 5px;
        box-shadow:3px 3px 0 var(--mff-shadow);
        background:linear-gradient(135deg,#fffdf7 0%,#fff6e6 100%);
      }
      .mff-pdp-layout{
        display:grid;
        grid-template-columns:auto minmax(0,1fr);
        align-items:center;
        gap:10px;
      }
      .mff-pdp-mark{
        width:34px;
        height:34px;
        display:grid;
        place-items:center;
        flex:0 0 auto;
        border:2px solid var(--mff-line);
        border-radius:12px 4px 12px 4px;
        background:var(--mff-gold);
        box-shadow:2px 2px 0 var(--mff-shadow);
        color:var(--mff-ink);
        font-size:15px;
        font-weight:950;
        line-height:1;
      }
      .mff-pdp .mff-kicker{
        margin:0 0 3px;
        font-size:9px;
        letter-spacing:.06em;
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
        max-width:220px;
        margin-top:7px;
        border-width:2px;
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
      .mff-products .mff-title{font-size:clamp(34px,4.6vw,64px)}
      .mff-product-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
      .mff-product-card{min-width:0;display:grid;grid-template-rows:auto minmax(0,1fr);border:2px solid var(--mff-line);border-radius:20px 7px 20px 7px;background:var(--mff-paper);overflow:hidden}
      .mff-product-media{position:relative;aspect-ratio:1/1;background:linear-gradient(135deg,#fff8ed,#f0e0bf)}
      .mff-product-media img{width:100%;height:100%;display:block;object-fit:cover}
      .mff-product-badge{position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;min-height:28px;border:2px solid var(--mff-line);border-radius:12px 4px 12px 4px;background:var(--mff-red);color:var(--mff-cream);padding:0 9px;font-size:11px;font-weight:950;text-transform:uppercase}
      .mff-product-body{display:grid;gap:10px;padding:13px}
      .mff-product-title{display:block;color:var(--mff-ink);font-size:18px;font-weight:950;line-height:1.05;text-transform:uppercase}
      .mff-product-desc{color:var(--mff-muted);font-size:12px;font-weight:850;line-height:1.35}
      .mff-product-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;color:var(--mff-ink);font-weight:950}
      .mff-product-price strong{font-size:20px;line-height:1}
      .mff-product-price s{color:var(--mff-muted);font-size:13px;font-weight:850}
      .mff-product-lot{display:grid;gap:6px}
      .mff-product-lot span{color:var(--mff-muted);font-size:11px;font-weight:900}
      .mff-product-actions{display:grid;gap:8px;margin-top:auto}
      .mff-product-actions .mff-button{width:100%;min-height:40px;border-width:2px;border-radius:14px 5px 14px 5px;box-shadow:3px 3px 0 var(--mff-shadow);font-size:10px}
      .mff-product-actions .mff-button:hover,.mff-product-actions .mff-button:focus-visible{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--mff-shadow)}
      .mff-product-message{min-height:16px;color:var(--mff-red);font-size:11px;font-weight:900}
      @media(max-width:760px){
        .mff-shell{padding:16px 14px;border-radius:22px 7px 22px 7px;box-shadow:5px 5px 0 var(--mff-shadow)}
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
        .mff-editorial{grid-template-columns:1fr}
        .mff-editorial-rail{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}
        .mff-note{min-width:72%;scroll-snap-align:start}
        .mff-editorial-rail .mff-visual{min-width:78%;min-height:260px;scroll-snap-align:start}
        .mff-actions{gap:8px}
        .mff-button,.mff-form button{width:100%}
        .mff-countdown{grid-template-columns:repeat(2,minmax(0,1fr))}
        .mff-cart-head{grid-template-columns:1fr}
        .mff-cart .mff-title{font-size:clamp(26px,9vw,42px)}
        .mff-cart-reward{margin-top:14px;padding:12px;gap:10px}
        .mff-reward-medal{width:48px;height:48px;font-size:23px}
        .mff-reward-status strong{font-size:clamp(17px,5vw,23px)}
        .mff-reward-status span{font-size:12px}
        .mff-pdp{padding:10px 10px;border-radius:14px 5px 14px 5px;box-shadow:3px 3px 0 var(--mff-shadow)}
        .mff-pdp-layout{grid-template-columns:auto minmax(0,1fr);gap:12px}
        .mff-pdp-actions{display:none}
        .mff-pdp .mff-button{width:100%;min-height:38px}
        .mff-pdp .mff-title{font-size:clamp(15px,4.3vw,18px)}
        .mff-pdp .mff-copy{font-size:11px}
        .mff-products-head{display:grid;gap:12px}
        .mff-product-grid{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 2px 8px;scrollbar-width:none}
        .mff-product-grid::-webkit-scrollbar{display:none}
        .mff-product-card{flex:0 0 min(82vw,330px);scroll-snap-align:start}
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
    el.innerHTML = `<section ${visualAttrs(copy)}>
      <div class="mff-hero">
        <div>
          <p class="mff-kicker">${escapeHtml(copy.kicker || "Live winactie")}</p>
          <h2 class="mff-title">${escapeHtml(copy.heading || "Bestel. Pak je lot.")}</h2>
          <p class="mff-copy">${escapeHtml(copyText(copy.body || "{rule}. Volg je loten en trekkingen transparant in Mijn MFF.", { rule: ruleLabel }))}</p>
          <div class="mff-actions">
            <a class="mff-button" href="${escapeHtml(storeHref(copy.primaryUrl || "/pages/actieve-loterijen"))}" target="_top">${escapeHtml(copy.primaryLabel || "Bekijk winacties")}</a>
            <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.secondaryUrl || "/collections/all"))}" target="_top">${escapeHtml(copy.secondaryLabel || "Shop vlees")}</a>
          </div>
        </div>
        ${visualImage(copy)}
        <div class="mff-panel mff-panel--gold">
          <span class="mff-label">${escapeHtml(copy.prizeLabel || "Hoofdprijs nu")}</span>
          <strong class="mff-number">${escapeHtml(draw?.prizeName || copy.fallbackPrize || "Vleespakket")}</strong>
          <p class="mff-copy">${escapeHtml(draw?.prizeValue || copy.fallbackPrizeValue || "Actieve trekking")} · ${escapeHtml(draw?.entryCount ?? 0)} loten live</p>
          ${countdownMarkup(draw)}
        </div>
      </div>
      ${compactWinnersMarkup(data)}
    </section>`;
    initCountdowns(el);
    setupWinnerPhotos(el);
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
        name: "Mark",
        prizeName: "BBQ Box",
        story: "Niet verwacht, maar die BBQ Box kwam perfect uit voor het weekend.",
        imageUrl: "https://i.pravatar.cc/160?img=12"
      },
      {
        name: "Sanne",
        prizeName: "250 euro vleestegoed",
        story: "Mijn bestelling pakte automatisch een lot en ineens had ik 250 euro vleestegoed.",
        imageUrl: "https://i.pravatar.cc/160?img=47"
      },
      {
        name: "Youssef",
        prizeName: "Kamado pakket",
        story: "Ik checkte Mijn MFF en zag dat het kamado pakket gewoon van mij was.",
        imageUrl: "https://i.pravatar.cc/160?img=32"
      },
      {
        name: "Niels",
        prizeName: "Dry-aged pakket",
        story: "Tweede bestelling, tweede lot, en toen stond dat dry-aged pakket op mijn naam.",
        imageUrl: "https://i.pravatar.cc/160?img=68"
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
    const winners = (usableManualWinners.length ? usableManualWinners : (automaticWinners.length ? automaticWinners : fallbackWinnerItems())).slice(0, limit);
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
    const heading = savedHeading === "Winnaars komen hier live." ? "Recente winnaars." : (savedHeading || "Recente winnaars.");
    const body = savedBody.toLowerCase().includes("voorbeeld")
      ? "Een snelle blik op recente Meat For Free trekkingen."
      : (savedBody || "Een snelle blik op recente Meat For Free trekkingen.");
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
    const price = Math.max(0, Number(rawPrice) || 0);
    const remaining = Math.max(0, threshold - price);
    const progress = threshold > 0 ? Math.min(100, Math.round((price / threshold) * 100)) : 0;
    const qualifies = price >= threshold;
    el.innerHTML = `<section ${visualAttrs(copy, "mff-pdp")}>
      <div class="mff-pdp-layout">
        <div class="mff-pdp-mark" aria-hidden="true">1</div>
        <div class="mff-pdp-copy">
          <p class="mff-kicker">${escapeHtml(copy.kicker || "Lot bij je bestelling")}</p>
          <h2 class="mff-title">${escapeHtml(qualifies ? (copy.qualifiesHeading || "Gratis lot met dit product.") : (copy.remainingHeading || "Dichter bij je lot."))}</h2>
          <p class="mff-copy">${escapeHtml(qualifies ? (copy.qualifiesBody || "Vanaf checkout automatisch gekoppeld.") : copyText(copy.remainingBody || "Nog {remaining} tot je gratis lot.", { remaining: formatEuro(remaining) }))}</p>
          <div class="mff-progress" aria-label="Productbijdrage naar gratis lot" style="--progress:${progress}%"><i></i></div>
        </div>
        <div class="mff-pdp-actions">
          <a class="mff-button" href="${escapeHtml(storeHref(copy.primaryUrl || "/collections/all"))}" target="_top">${escapeHtml(copy.primaryLabel || "Verder shoppen")}</a>
          <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.secondaryUrl || "/pages/actieve-loterijen"))}" target="_top">${escapeHtml(copy.secondaryLabel || "Winactie")}</a>
        </div>
      </div>
    </section>`;
  }

  function productCardItems(copy) {
    return [
      ["productOne", "1"],
      ["productTwo", "2"],
      ["productThree", "3"],
      ["productFour", "4"]
    ].map(([prefix]) => {
      const title = String(copy[`${prefix}Title`] || "").trim();
      const priceCents = Math.max(0, Number(copy[`${prefix}PriceCents`] || 0) || 0);
      const compareAtCents = Math.max(0, Number(copy[`${prefix}CompareAtCents`] || 0) || 0);
      return {
        title,
        description: String(copy[`${prefix}Description`] || "").trim(),
        imageUrl: String(copy[`${prefix}ImageUrl`] || "").trim(),
        url: String(copy[`${prefix}Url`] || copy.collectionUrl || "/collections/all").trim(),
        variantId: String(copy[`${prefix}VariantId`] || "").trim(),
        priceCents,
        compareAtCents
      };
    }).filter((item) => item.title && item.priceCents > 0);
  }

  function saleBadge(item) {
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
          if (button) button.textContent = "Toegevoegd";
          if (message) message.textContent = "Toegevoegd aan je winkelwagen.";
          window.setTimeout(() => {
            if (button) {
              button.disabled = false;
              button.textContent = original;
            }
          }, 1200);
        } catch (error) {
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
    const products = productCardItems(copy);
    const showSavings = structure.showSavings !== false;
    const showDetails = structure.showDetailsLink !== false;
    const directAdd = structure.directAddEnabled !== false;
    el.innerHTML = `<section ${sectionAttrs(copy, "mff-products")}>
      <div class="mff-products-head">
        <div>
          <p class="mff-kicker">Producten</p>
          <h2 class="mff-title mff-title--ink">${escapeHtml(copy.heading || "Populaire pakketten")}</h2>
          <p class="mff-copy">${escapeHtml(copy.body || "Snel shoppen met prijs, korting, details en direct in de winkelwagen.")}</p>
        </div>
        <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.collectionUrl || "/collections/all"))}" target="_top">Alles bekijken</a>
      </div>
      <div class="mff-product-grid">
        ${products.map((item) => `<article class="mff-product-card">
          <a class="mff-product-media" href="${escapeHtml(storeHref(item.url))}" target="_top" aria-label="${escapeHtml(item.title)} bekijken">
            ${item.imageUrl ? `<img src="${escapeHtml(appAssetHref(item.imageUrl))}" alt="${escapeHtml(item.title)}" loading="lazy">` : ""}
            ${showSavings ? saleBadge(item) : ""}
          </a>
          <div class="mff-product-body">
            <strong class="mff-product-title">${escapeHtml(item.title)}</strong>
            ${item.description ? `<p class="mff-product-desc">${escapeHtml(item.description)}</p>` : ""}
            <div class="mff-product-price">
              <strong>${formatEuro(item.priceCents)}</strong>
              ${showSavings && item.compareAtCents > item.priceCents ? `<s>${formatEuro(item.compareAtCents)}</s>` : ""}
            </div>
            ${productLotMarkup(item, data, structure)}
            <div class="mff-product-actions">
              ${directAdd && item.variantId
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
    const draw = data.liveDraw;
    const features = [copy.featureOne, copy.featureTwo, copy.featureThree, copy.featureFour].filter(Boolean);
    el.innerHTML = `<section ${sectionAttrs(copy, "mff-membership")}>
      <div>
        <p class="mff-kicker">${escapeHtml(copy.kicker || "Meat For Free club")}</p>
        <h2 class="mff-title mff-title--ink">${escapeHtml(copy.heading || "Altijd meedoen.")}</h2>
        <p class="mff-copy">${escapeHtml(copy.body || "Voor vaste liefhebbers: automatische deelname, betere acties en een dashboard voor je loten.")}</p>
        <div class="mff-chip-list">
          ${(features.length ? features : ["Automatische loten", "Vroege toegang", "Clubvoordeel", "Mijn MFF dashboard"]).map((feature, index) => `<span class="mff-chip"><i>${index + 1}</i>${escapeHtml(feature)}</span>`).join("")}
        </div>
        <div class="mff-actions">
          <a class="mff-button" href="${escapeHtml(storeHref(copy.primaryUrl || "/pages/memberships"))}" target="_top">${escapeHtml(copy.primaryLabel || "Word lid")}</a>
          <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.secondaryUrl || "/pages/mijn-mff-dashboard"))}" target="_top">${escapeHtml(copy.secondaryLabel || "Mijn MFF")}</a>
        </div>
      </div>
      ${visualImage(copy)}
      <div class="mff-ticket">
        <span class="mff-badge">${escapeHtml(draw?.status || "Club")}</span>
        ${visualImage(copy)}
        <strong>${escapeHtml(draw?.prizeName || "Meer kans. Meer vlees.")}</strong>
      </div>
    </section>`;
  }

  function communityWidget(el, data) {
    const copy = widgetCopy(data, "community");
    const notes = [copy.noteOne, copy.noteTwo, copy.noteThree].filter(Boolean);
    el.innerHTML = `<section ${sectionAttrs(copy, "mff-editorial")}>
      <div>
        <p class="mff-kicker">${escapeHtml(copy.kicker || "BBQ inspiratie")}</p>
        <h2 class="mff-title mff-title--ink">${escapeHtml(copy.heading || "Wat zet jij op het vuur?")}</h2>
        <p class="mff-copy">${escapeHtml(copy.body || "Laat recepten, klantfoto's en BBQ challenges zien zonder de shop uit het oog te verliezen.")}</p>
        <div class="mff-actions">
          <a class="mff-button" href="${escapeHtml(storeHref(copy.primaryUrl || "/pages/bbq-inspiratie"))}" target="_top">${escapeHtml(copy.primaryLabel || "Bekijk inspiratie")}</a>
          <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref(copy.secondaryUrl || "/pages/community"))}" target="_top">${escapeHtml(copy.secondaryLabel || "Community")}</a>
        </div>
      </div>
      <div class="mff-editorial-rail">
        ${visualImage(copy)}
        ${(notes.length ? notes : ["Recepten", "Klantfoto's", "Challenges"]).map((note) => `<div class="mff-note">${escapeHtml(note)}</div>`).join("")}
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
      try {
        const result = await fetchJson("/api/free-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        message.textContent = result.skipped ? (copy.duplicateText || "Je gratis deelname stond al geregistreerd.") : (copy.successPrefix || "Gelukt. Lotnummer:") + " " + result.entry.entryNumber;
      } catch (error) {
        message.textContent = error.message;
      }
    });
  }

  async function render(el) {
    injectStyles();
    el.innerHTML = '<section class="mff-widget mff-shell"><p class="mff-kicker">Laden</p><h2 class="mff-title mff-title--ink">MFF wordt geladen.</h2></section>';
    try {
      const data = await fetchJson("/api/site/summary");
      const type = el.getAttribute("data-dvl-lottery") || "live";
      const preview = window.DVL_WIDGET_PREVIEW;
      if (preview && preview.key === type && preview.settings && typeof preview.settings === "object") {
        data.widgets = { ...(data.widgets || {}), [type]: { ...((data.widgets || {})[type] || {}), ...preview.settings } };
      }
      if (type === "free-entry") return freeEntryWidget(el, data);
      if (type === "customer") return customerWidget(el, data);
      if (type === "cart") return cartWidget(el, data);
      if (type === "winners") return winnersWidget(el, data);
      if (type === "product-cards") return productCardsWidget(el, data);
      if (type === "pdp") return pdpWidget(el, data);
      if (type === "how-it-works") return howItWorksWidget(el, data);
      if (type === "trust") return trustWidget(el, data);
      if (type === "membership") return membershipWidget(el, data);
      if (type === "community") return communityWidget(el, data);
      return liveWidget(el, data);
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
  res.setHeader("cache-control", "public, max-age=60");
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
      <div data-dvl-lottery="pdp" data-product-price-cents="2549"></div>
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
  res.setHeader("x-frame-options", "ALLOWALL");
  res.send(`<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meat For Free Lottery ${widget}</title>
    <style>
      html,body{min-height:100%;margin:0;overflow:hidden;background:transparent}
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
          const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, document.documentElement.offsetHeight, document.body.offsetHeight);
          window.parent.postMessage({ type: "dvl:lottery-frame-height", sectionId, height }, "*");
        };
        window.addEventListener("load", sendHeight);
        window.addEventListener("resize", sendHeight);
        new ResizeObserver(sendHeight).observe(document.body);
        window.setInterval(sendHeight, 1200);
      })();
    </script>
    <script src="/embed/dvl-lottery.js"></script>
  </body>
</html>`);
});
