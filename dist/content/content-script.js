const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["chunks/storage-D8IV6tbf.js","chunks/_commonjsHelpers-Cpj98o6Y.js"])))=>i.map(i=>d[i]);
import{_ as E}from"../chunks/preload-helper-D7HrI6pR.js";let d=null;async function C(){return d||(d=(await E(()=>import("../chunks/storage-D8IV6tbf.js").then(n=>n.b),__vite__mapDeps([0,1]))).default),d}chrome.runtime.onMessage.addListener((t,n,e)=>(S(t,e),!0));async function S(t,n){try{switch(await C(),t.type){case"SAVE_NOTE":const e=await d.saveNote(t.payload.note);n({success:!0,noteId:e});break;case"EXTRACT_CONTENT":const o=A();n(o);break;default:n({error:"Unknown content script message"})}}catch(e){console.error("Content script error:",e),n({error:e instanceof Error?e.message:"Content script error"})}}function A(){try{const t={url:window.location.href,title:document.title,content:"",metadata:{domain:window.location.hostname,language:document.documentElement.lang||"fr"}},n={description:a("description")||a("og:description"),author:a("author")||a("article:author"),publishDate:a("article:published_time")||a("date"),keywords:a("keywords"),ogImage:a("og:image"),siteName:a("og:site_name"),articleSection:a("article:section"),articleTag:a("article:tag")};Object.assign(t.metadata,n);const e=[()=>M(),()=>_(),()=>k([".content",".post-content",".entry-content",".article-content","#content",".main-content"]),()=>N()];for(const r of e){const l=r();if(l&&l.trim().length>100){t.content=l;break}}const o=T();return{success:!0,...t,type:o,extractedAt:Date.now()}}catch(t){return{success:!1,error:t instanceof Error?t.message:"Erreur extraction"}}}function a(t){const n=[`meta[name="${t}"]`,`meta[property="${t}"]`,`meta[name="twitter:${t}"]`,`meta[property="twitter:${t}"]`];for(const e of n){const o=document.querySelector(e);if(o){const r=o.getAttribute("content");if(r)return r}}return""}function M(){var e;const t=document.querySelector("article");return t&&((e=u(t.cloneNode(!0)).textContent)==null?void 0:e.trim())||""}function _(){var e;const t=document.querySelector('main, [role="main"]');return t&&((e=u(t.cloneNode(!0)).textContent)==null?void 0:e.trim())||""}function k(t){var n;for(const e of t){const o=document.querySelector(e);if(o){const l=((n=u(o.cloneNode(!0)).textContent)==null?void 0:n.trim())||"";if(l.length>100)return l}}return""}function N(){var e;const t=document.body.cloneNode(!0);return((e=u(t).textContent)==null?void 0:e.trim())||""}function u(t){return["script","style","nav","header","footer","aside",".navigation",".nav",".menu",".sidebar",".widget",".advertisement",".ads",".ad",".social",".share",".comments",".comment",".related",".recommended",'[class*="ad-"]','[id*="ad-"]','[class*="advertisement"]',".cookie-banner",".popup",".modal",".overlay"].forEach(e=>{t.querySelectorAll(e).forEach(o=>o.remove())}),t.querySelectorAll("*").forEach(e=>{const o=["href","src","alt","title"];Array.from(e.attributes).forEach(r=>{o.includes(r.name)||e.removeAttribute(r.name)})}),t}function T(){const t=window.location.href.toLowerCase(),n=document.title.toLowerCase(),e=window.location.hostname.toLowerCase();return t.includes(".pdf")?"pdf":e.includes("youtube")||e.includes("youtu.be")||e.includes("vimeo")||t.includes("/video/")?"video":e.includes("docs.")||t.includes("/docs/")||t.includes("/documentation/")||n.includes("documentation")?"documentation":e.includes("scholar.google")||e.includes("arxiv.org")||e.includes("researchgate")||e.includes("pubmed")||n.includes("research")||n.includes("study")||n.includes("journal")||a("article:section")?"research-paper":t.includes("/article/")||t.includes("/post/")||t.includes("/blog/")||a("article:published_time")?"article":"webpage"}function L(){if(document.getElementById("academic-notes-styles"))return;const t=document.createElement("style");t.id="academic-notes-styles",t.textContent=`
    .academic-notes-highlight {
      background-color: rgba(255, 235, 59, 0.3) !important;
      border: 1px solid #ffc107 !important;
      border-radius: 2px !important;
    }
    
    .academic-notes-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background: rgba(0, 0, 0, 0.1) !important;
      z-index: 10000 !important;
      cursor: crosshair !important;
    }
    
    .academic-notes-selection-box {
      position: absolute !important;
      border: 2px dashed #2196f3 !important;
      background: rgba(33, 150, 243, 0.1) !important;
      pointer-events: none !important;
    }
    
    .academic-notes-tooltip {
      position: absolute !important;
      background: #333 !important;
      color: white !important;
      padding: 8px 12px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      font-family: system-ui, sans-serif !important;
      z-index: 10001 !important;
      pointer-events: none !important;
    }
  `,document.head.appendChild(t)}function p(){L();let t=!1,n=0,e=0,o=null,r=null;function l(i){i.ctrlKey&&i.shiftKey&&(i.preventDefault(),i.stopPropagation(),t=!0,n=i.clientX,e=i.clientY,o=document.createElement("div"),o.className="academic-notes-overlay",document.body.appendChild(o),r=document.createElement("div"),r.className="academic-notes-selection-box",o.appendChild(r),o.addEventListener("mousemove",f),o.addEventListener("mouseup",h),o.addEventListener("keydown",c=>{c.key==="Escape"&&g()}),o.focus())}function f(i){if(!t||!r)return;const c=i.clientX,s=i.clientY,b=Math.min(n,c),w=Math.min(e,s),x=Math.abs(c-n),v=Math.abs(s-e);r.style.left=b+"px",r.style.top=w+"px",r.style.width=x+"px",r.style.height=v+"px"}function h(i){if(!t||!r)return;const c=r.getBoundingClientRect();if(c.width>10&&c.height>10){const s=y(c);s.trim()&&chrome.runtime.sendMessage({type:"SAVE_NOTE",payload:{note:{title:`Sélection zone - ${document.title}`,content:s,url:window.location.href,type:"webpage",metadata:{domain:window.location.hostname,selectionArea:{x:c.left,y:c.top,width:c.width,height:c.height}},tags:["sélection-zone"],concepts:[]}}})}m()}function g(){m()}function m(){t=!1,o&&(o.remove(),o=null),r=null}function y(i){const c=document.elementsFromPoint(i.left+i.width/2,i.top+i.height/2);for(const s of c)if(s.textContent&&s.textContent.trim().length>20)return s.textContent.trim();return""}document.addEventListener("mousedown",l,!0)}function q(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{p()}):p()}q();
