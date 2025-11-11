const C="modulepreload",S=function(t){return"/"+t},y={},A=function(n,e,o){let i=Promise.resolve();if(e&&e.length>0){document.getElementsByTagName("link");const a=document.querySelector("meta[property=csp-nonce]"),d=(a==null?void 0:a.nonce)||(a==null?void 0:a.getAttribute("nonce"));i=Promise.allSettled(e.map(m=>{if(m=S(m),m in y)return;y[m]=!0;const f=m.endsWith(".css"),g=f?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${m}"]${g}`))return;const r=document.createElement("link");if(r.rel=f?"stylesheet":C,f||(r.as="script"),r.crossOrigin="",r.href=m,d&&r.setAttribute("nonce",d),document.head.appendChild(r),f)return new Promise((c,u)=>{r.addEventListener("load",c),r.addEventListener("error",()=>u(new Error(`Unable to preload CSS for ${m}`)))})}))}function l(a){const d=new Event("vite:preloadError",{cancelable:!0});if(d.payload=a,window.dispatchEvent(d),!d.defaultPrevented)throw a}return i.then(a=>{for(const d of a||[])d.status==="rejected"&&l(d.reason);return n().catch(l)})};let p=null;async function k(){return p||(p=(await A(()=>import("../chunks/storage-DCCFt_iF.js").then(n=>n.a),[])).default),p}chrome.runtime.onMessage.addListener((t,n,e)=>(L(t,e),!0));async function L(t,n){try{switch(await k(),t.type){case"SAVE_NOTE":const e=await p.saveNote(t.payload.note);n({success:!0,noteId:e});break;case"EXTRACT_CONTENT":const o=T();n(o);break;default:n({error:"Unknown content script message"})}}catch(e){console.error("Content script error:",e),n({error:e instanceof Error?e.message:"Content script error"})}}function T(){try{const t={url:window.location.href,title:document.title,content:"",metadata:{domain:window.location.hostname,language:document.documentElement.lang||"fr"}},n={description:s("description")||s("og:description"),author:s("author")||s("article:author"),publishDate:s("article:published_time")||s("date"),keywords:s("keywords"),ogImage:s("og:image"),siteName:s("og:site_name"),articleSection:s("article:section"),articleTag:s("article:tag")};Object.assign(t.metadata,n);const e=[()=>_(),()=>N(),()=>M([".content",".post-content",".entry-content",".article-content","#content",".main-content"]),()=>P()];for(const i of e){const l=i();if(l&&l.trim().length>100){t.content=l;break}}const o=q();return{success:!0,...t,type:o,extractedAt:Date.now()}}catch(t){return{success:!1,error:t instanceof Error?t.message:"Erreur extraction"}}}function s(t){const n=[`meta[name="${t}"]`,`meta[property="${t}"]`,`meta[name="twitter:${t}"]`,`meta[property="twitter:${t}"]`];for(const e of n){const o=document.querySelector(e);if(o){const i=o.getAttribute("content");if(i)return i}}return""}function _(){var e;const t=document.querySelector("article");return t&&((e=h(t.cloneNode(!0)).textContent)==null?void 0:e.trim())||""}function N(){var e;const t=document.querySelector('main, [role="main"]');return t&&((e=h(t.cloneNode(!0)).textContent)==null?void 0:e.trim())||""}function M(t){var n;for(const e of t){const o=document.querySelector(e);if(o){const l=((n=h(o.cloneNode(!0)).textContent)==null?void 0:n.trim())||"";if(l.length>100)return l}}return""}function P(){var e;const t=document.body.cloneNode(!0);return((e=h(t).textContent)==null?void 0:e.trim())||""}function h(t){return["script","style","nav","header","footer","aside",".navigation",".nav",".menu",".sidebar",".widget",".advertisement",".ads",".ad",".social",".share",".comments",".comment",".related",".recommended",'[class*="ad-"]','[id*="ad-"]','[class*="advertisement"]',".cookie-banner",".popup",".modal",".overlay"].forEach(e=>{t.querySelectorAll(e).forEach(o=>o.remove())}),t.querySelectorAll("*").forEach(e=>{const o=["href","src","alt","title"];Array.from(e.attributes).forEach(i=>{o.includes(i.name)||e.removeAttribute(i.name)})}),t}function q(){const t=window.location.href.toLowerCase(),n=document.title.toLowerCase(),e=window.location.hostname.toLowerCase();return t.includes(".pdf")?"pdf":e.includes("youtube")||e.includes("youtu.be")||e.includes("vimeo")||t.includes("/video/")?"video":e.includes("docs.")||t.includes("/docs/")||t.includes("/documentation/")||n.includes("documentation")?"documentation":e.includes("scholar.google")||e.includes("arxiv.org")||e.includes("researchgate")||e.includes("pubmed")||n.includes("research")||n.includes("study")||n.includes("journal")||s("article:section")?"research-paper":t.includes("/article/")||t.includes("/post/")||t.includes("/blog/")||s("article:published_time")?"article":"webpage"}function $(){if(document.getElementById("academic-notes-styles"))return;const t=document.createElement("style");t.id="academic-notes-styles",t.textContent=`
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
  `,document.head.appendChild(t)}function w(){$();let t=!1,n=0,e=0,o=null,i=null;function l(r){r.ctrlKey&&r.shiftKey&&(r.preventDefault(),r.stopPropagation(),t=!0,n=r.clientX,e=r.clientY,o=document.createElement("div"),o.className="academic-notes-overlay",document.body.appendChild(o),i=document.createElement("div"),i.className="academic-notes-selection-box",o.appendChild(i),o.addEventListener("mousemove",a),o.addEventListener("mouseup",d),o.addEventListener("keydown",c=>{c.key==="Escape"&&m()}),o.focus())}function a(r){if(!t||!i)return;const c=r.clientX,u=r.clientY,b=Math.min(n,c),E=Math.min(e,u),v=Math.abs(c-n),x=Math.abs(u-e);i.style.left=b+"px",i.style.top=E+"px",i.style.width=v+"px",i.style.height=x+"px"}function d(r){if(!t||!i)return;const c=i.getBoundingClientRect();if(c.width>10&&c.height>10){const u=g(c);u.trim()&&chrome.runtime.sendMessage({type:"SAVE_NOTE",payload:{note:{title:`Sélection zone - ${document.title}`,content:u,url:window.location.href,type:"webpage",metadata:{domain:window.location.hostname,selectionArea:{x:c.left,y:c.top,width:c.width,height:c.height}},tags:["sélection-zone"],concepts:[]}}})}f()}function m(){f()}function f(){t=!1,o&&(o.remove(),o=null),i=null}function g(r){const c=document.elementsFromPoint(r.left+r.width/2,r.top+r.height/2);for(const u of c)if(u.textContent&&u.textContent.trim().length>20)return u.textContent.trim();return""}document.addEventListener("mousedown",l,!0)}function B(){console.log("Academic Notes content script loaded"),document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{w()}):w()}B();
