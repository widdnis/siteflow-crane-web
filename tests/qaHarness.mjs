
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createOutputFilename } from '../src/outputFilename.js';
import { createAppState } from '../src/data/state.js';
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
export const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Classes {
 constructor(){this.values=new Set();}
 add(...values){values.forEach(v=>this.values.add(v));}
 remove(...values){values.forEach(v=>this.values.delete(v));}
 contains(value){return this.values.has(value);}
 toggle(value,on){if(on??!this.contains(value))this.add(value);else this.remove(value);}
}
export class FakeElement {
 constructor(tag='div'){
  this.tag=tag;this.hidden=false;this.disabled=false;this.children=[];this.listeners=new Map();this.classList=new Classes();this.attributes={};this.dataset={};
  this.value='';this.textContent='';this.clientWidth=800;this.clientHeight=640;this.style={};this.nodes=[];this.idMap=new Map();
  this.decode=async()=>{};this.complete=true;this.naturalWidth=2400;
 }
 set innerHTML(html){
  this.html=html;this.children=[];this.nodes=[];this.idMap=new Map();
  for(const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)){
   const node=new FakeElement(match[1]),attrs=match[2];
   node.checked=/\bchecked\b/.test(attrs);node.hidden=/\bhidden\b/.test(attrs);node.disabled=/\bdisabled\b/.test(attrs);node.open=/\bopen\b/.test(attrs);node.attrs=attrs;
   const id=/\bid="([^"]+)"/.exec(attrs);if(id){node.id=id[1];this.idMap.set(node.id,node);}
   const view=/\bdata-view="([^"]+)"/.exec(attrs);if(view)node.dataset.view=view[1];
   const tab=/\bdata-tab="([^"]+)"/.exec(attrs);if(tab)node.dataset.tab=tab[1];
   const classes=/\bclass="([^"]+)"/.exec(attrs);classes?.[1].split(/\s+/).forEach(c=>node.classList.add(c));
   this.nodes.push(node);
  }
 }
 get innerHTML(){return this.html??'';}
 querySelector(selector){
  if(selector.startsWith('#'))return this.idMap.get(selector.slice(1))??null;
  if(selector.startsWith('.'))return this.nodes.find(n=>n.classList.contains(selector.slice(1)))??null;
  return this.nodes.find(n=>n.tag===selector)??null;
 }
 querySelectorAll(selector){if(selector==='[data-view]')return this.nodes.filter(n=>n.dataset.view);if(selector==='details[data-print-expand]')return this.nodes.filter(n=>n.tag==='details'&&n.attrs.includes('data-print-expand'));return [];}
 appendChild(node){this.children.push(node);return node;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;this.nodes=[];this.idMap.clear();}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 async emit(type,event={}){await Promise.all([...(this.listeners.get(type)??[])].map(fn=>fn({target:this,preventDefault(){},...event})));}
 remove(){}
 click(){}
 getContext(){
  const ctx={measureText:text=>({width:String(text).length*10})};
  for(const method of ['fillRect','fillText','strokeRect','save','restore','beginPath','rect','clip','moveTo','lineTo','closePath','fill','stroke','arc','setLineDash'])ctx[method]=()=>{};
  return ctx;
 }
 toBlob(callback){callback(new Blob(['API mock only'],{type:'image/png'}));}
 listenerCount(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
export function fakeDocument() {
 const body=new FakeElement('body'),events=new FakeElement();
 return {body,events,fullscreenElement:null,fonts:{ready:Promise.resolve()},createElement:tag=>new FakeElement(tag),
  addEventListener:(...args)=>events.addEventListener(...args),removeEventListener:(...args)=>events.removeEventListener(...args),
  querySelector:s=>body.querySelector(s)};
}
export async function loadFunction(file,names,context={}) {
 let source=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
 source=source.replace(/^import .*;\r?\n/gm,'').replace(/export function /g,'function ');
 const sandbox={AbortController,console,Blob,setTimeout,clearTimeout,createOutputFilename,...context};
 vm.runInNewContext(source+'\nglobalThis.__exports={'+names.join(',')+'};',sandbox,{filename:file});
 return sandbox.__exports;
}
export async function mainHarness() {
 const document=fakeDocument(),counts={mounted:{},disposed:{}},modules=new Map(),seen=[],failure={};
 const makeMount=tab=>(snapshot,host,persistence)=>{
  if(failure[tab])throw new Error(failure[tab]);
  seen.push({tab,snapshot,persistence});counts.mounted[tab]=(counts.mounted[tab]??0)+1;
  if(tab==='report')document.body.classList.add('report-active');
  return ()=>{counts.disposed[tab]=(counts.disposed[tab]??0)+1;if(tab==='report')document.body.classList.remove('report-active');host.replaceChildren();};
 };
 const mounts={mountSiteViewer:makeMount('viewer'),mountLayoutView:makeMount('layout'),mountReportView:makeMount('report')};
 let source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
 source=source.replace(/^import .*;\r?\n/gm,'').replace(/import\('\.\/(viewer|layoutView|reportView)\.js'\)/g,(_,name)=>'loadViewModule("'+name+'")');
 const sandbox={document,AbortController,console,createAppState,
  loadLocalJson:()=>{},loadJsonUrl:()=>{},loadViewModule:async name=>modules.has(name)?await modules.get(name):mounts};
 const originalSetter=Object.getOwnPropertyDescriptor(FakeElement.prototype,'innerHTML').set;
 Object.defineProperty(document.body,'innerHTML',{set(html){
  originalSetter.call(this,html);
  this.idMap.set('url-submit',new FakeElement('button'));
  this.nav=this.nodes.find(n=>n.tag==='nav');
  this.homeButton=new FakeElement('button');this.tabs=this.nodes.filter(n=>n.dataset.tab);
 }});
 document.querySelector=selector=>selector==='#url-form button'?document.body.idMap.get('url-submit'):selector==='nav'?document.body.nav:selector==='[data-action="home"]'?document.body.homeButton:document.body.querySelector(selector);
 document.querySelectorAll=selector=>selector==='[data-tab]'?document.body.tabs:[];
 vm.runInNewContext(source+'\nglobalThis.__app={state,request,showHome,showResults};',sandbox,{filename:'main.js'});
 return {app:sandbox.__app,document,nodes:document.body.idMap,counts,modules,mounts,seen,failure};
}
