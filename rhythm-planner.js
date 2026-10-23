/* SleepSphere Rhythm Planner v0.1 — standalone, opt-in, no storage or network.
 * Advisory scheduling only: user-supplied energy windows, not biological predictions.
 * Keeps existing sleep, Motherhood and reporting modules untouched.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.SleepSphereRhythmPlanner=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const validMinute=n=>Number.isInteger(n)&&n>=0&&n<=1440;
  function planDay(input){
    if(!input||!Array.isArray(input.tasks)||!Array.isArray(input.windows)) throw new TypeError('Tasks and windows required');
    const windows=input.windows.map((w,i)=>{
      if(!w||!validMinute(w.start)||!validMinute(w.end)||w.start>=w.end||!['high','medium','low'].includes(w.energy)) throw new TypeError('Invalid window');
      return {start:w.start,end:w.end,energy:w.energy,index:i};
    }).sort((a,b)=>a.start-b.start);
    for(let i=1;i<windows.length;i++) if(windows[i].start<windows[i-1].end) throw new TypeError('Overlapping windows');
    const tasks=input.tasks.map((t,i)=>{
      if(!t||typeof t.title!=='string'||!t.title.trim()||t.title.length>100||!Number.isInteger(t.minutes)||t.minutes<5||t.minutes>240||!['deep','routine','rest'].includes(t.kind)) throw new TypeError('Invalid task');
      return {...t,index:i};
    });
    const busy=(input.busy||[]).map(b=>{
      if(!b||!validMinute(b.start)||!validMinute(b.end)||b.start>=b.end) throw new TypeError('Invalid busy period');
      return {start:b.start,end:b.end};
    });
    const occupied=busy.slice(),scheduled=[],unscheduled=[];
    const preference={deep:['high','medium','low'],routine:['medium','low','high'],rest:['low','medium','high']};
    const priority={deep:0,routine:1,rest:2};
    for(const task of tasks.slice().sort((a,b)=>priority[a.kind]-priority[b.kind]||a.index-b.index)){
      let slot=null;
      for(const energy of preference[task.kind]){
        for(const w of windows.filter(w=>w.energy===energy)){
          for(let start=w.start;start+task.minutes<=w.end;start+=5){
            const end=start+task.minutes;
            if(!occupied.some(b=>start<b.end&&end>b.start)){slot={title:task.title,kind:task.kind,start,end,energy,taskIndex:task.index};break;}
          }
          if(slot)break;
        }
        if(slot)break;
      }
      if(slot){scheduled.push(slot);occupied.push({start:slot.start,end:slot.end});}
      else unscheduled.push({title:task.title,taskIndex:task.index,reason:'No available window; adjust tasks or availability'});
    }
    return {scheduled:scheduled.sort((a,b)=>a.start-b.start),unscheduled,
      disclaimer:'Suggested plan based on your stated energy and availability, not a prediction of cognitive performance.'};
  }
  return Object.freeze({planDay});
});
