"use client";
import { useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import type { Album } from "@/types/album";
import { albumAtRatio } from "@/lib/albums/catalogue";

function WaveBar({index,hover,selected,reduced}:{index:number;hover:MotionValue<number>;selected:boolean;reduced:boolean}) {
  const influence=useTransform(hover,value=>Math.exp(-Math.pow((index-value)/1.65,2)/2));
  const height=useTransform(influence,value=>1+value*(reduced?.7:2.8)+(selected?.45:0));
  const lift=useTransform(influence,value=>value*(reduced?-1:-7));
  const scaleY=useSpring(height,{stiffness:460,damping:24,mass:.55});
  const y=useSpring(lift,{stiffness:420,damping:22,mass:.6});
  const opacity=useTransform(influence,value=>Math.min(1,(selected?.9:.35)+value*.65));
  return <motion.span className="space-wave-bar" style={{scaleY,y,opacity}}/>;
}
export function AlbumScrubber({albums,activeAlbumIndex,onJump,reduced}:{
  albums:Album[];activeAlbumIndex:number;onJump:(index:number)=>void;reduced:boolean;
}) {
  const count=37,hover=useMotionValue(-100);
  const [focused,setFocused]=useState(-1);
  if(albums.length<2)return null;
  const selected=Math.round(activeAlbumIndex/Math.max(1,albums.length-1)*(count-1));
  return <nav className="space-range-navigation" aria-label="按位置快速跳转专辑"
    onPointerMove={event=>{if(event.pointerType==="touch")return;const rect=event.currentTarget.getBoundingClientRect();hover.set(Math.max(0,Math.min(count-1,(event.clientX-rect.left)/rect.width*(count-1))));}}
    onPointerLeave={()=>hover.set(focused>=0?focused:-100)}>
    {Array.from({length:count},(_,index)=>{
      const target=albumAtRatio(index/(count-1),albums.length);
      return <button type="button" className="space-range-stop" key={index}
        aria-label={`跳转至约 ${Math.round(index/(count-1)*100)}%：${albums[target].title}`} title={albums[target].title}
        aria-current={index===selected?"true":undefined}
        onFocus={()=>{setFocused(index);hover.set(index);}} onBlur={()=>{setFocused(-1);hover.set(-100);}}
        onClick={()=>onJump(target)} onKeyDown={event=>{
          if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){
            event.preventDefault();event.stopPropagation();
            const next=event.key==="Home"?0:event.key==="End"?count-1:Math.max(0,Math.min(count-1,index+(event.key==="ArrowLeft"?-1:1)));
            (event.currentTarget.parentElement?.children[next] as HTMLButtonElement|undefined)?.focus();
          }
        }}>
        <WaveBar index={index} hover={hover} selected={selected===index} reduced={reduced}/>
      </button>;
    })}
  </nav>;
}
