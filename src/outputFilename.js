// Output names depend only on the current input source and the output click time.
export function jsonFilenameStem(source={}) {
  let name=typeof source.name==='string'?source.name:'';
  if(source.kind==='url') {
    try {
      const url=new URL(name);
      if(!['http:','https:'].includes(url.protocol))return 'siteflow';
      name=decodeURIComponent(url.pathname.split('/').at(-1)??'');
    } catch { return 'siteflow'; }
  }
  if(!/\.json$/i.test(name))return 'siteflow';
  name=name.replace(/\.json$/i,'').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_');
  return name.trim()?name:'siteflow';
}
export function localOutputTimestamp(time=new Date()) {
  if(!(Object.prototype.toString.call(time)==='[object Date]')||!Number.isFinite(time.getTime()))throw new Error('Invalid output time');
  const pad=value=>String(value).padStart(2,'0');
  return String(time.getFullYear()).padStart(4,'0')+pad(time.getMonth()+1)+pad(time.getDate())+'_'+pad(time.getHours())+pad(time.getMinutes())+pad(time.getSeconds());
}
export function createOutputFilename(source,kind,time=new Date()) {
  if(!['Layout','Report'].includes(kind))throw new Error('Invalid output kind');
  return jsonFilenameStem(source)+'_'+kind+'_'+localOutputTimestamp(time)+(kind==='Layout'?'.png':'.pdf');
}
