import type {Edit} from './shared';
/** Render an already rotated/mirrored crop using the same contain/cover geometry as FFmpeg. */
export function drawOutput(ctx:CanvasRenderingContext2D,source:CanvasImageSource,edit:Edit,factor=1){
 const w=ctx.canvas.width,h=ctx.canvas.height,sx=edit.x*factor,sy=edit.y*factor,sw=edit.width*factor,sh=edit.height*factor;
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
 if(edit.background==='blur'){
  const scale=Math.max(w/sw,h/sh),pad=Math.max(8,Math.min(w,h)*.06);ctx.save();ctx.filter=`blur(${pad}px)`;
  ctx.drawImage(source,sx,sy,sw,sh,(w-sw*scale)/2-pad,(h-sh*scale)/2-pad,sw*scale+pad*2,sh*scale+pad*2);ctx.restore();
 }else if(edit.background&&edit.background!=='none'){ctx.fillStyle=edit.background;ctx.fillRect(0,0,w,h);}
 const scale=Math.min(w/sw,h/sh);ctx.drawImage(source,sx,sy,sw,sh,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);ctx.restore();
}
