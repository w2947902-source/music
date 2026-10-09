"use client";
import { useEffect, useRef, useState, type RefObject, type PointerEvent as PointerInput, type MouseEvent } from "react";
import { AnimatePresence, motion, useTransform, type MotionValue } from "motion/react";
import type { Album } from "@/types/album";
import { acquireMediaUrl, releaseMediaUrl } from "@/lib/storage/mediaUrls";
import { AlbumCover } from "./AlbumCover";

type Navigation = {
  albums: Album[];
  activeAlbumIndex: number;
  position: MotionValue<number>;
  onSelect: (index: number) => void;
  onStep: (direction: number) => void;
  onDragStart: () => void;
};
function useWheelInput(ref: RefObject<HTMLElement | null>, onStep: (direction:number)=>void, vertical:boolean, enabled=true) {
  const callback=useRef(onStep);
  useEffect(()=>{callback.current=onStep;},[onStep]);
  useEffect(()=>{
    const element=ref.current;if(!element||!enabled)return;
    let accumulated=0,last=0,lockedUntil=0;
    const wheel=(event:WheelEvent)=>{
      if(!vertical&&Math.abs(event.deltaX)<Math.abs(event.deltaY))return;
      event.preventDefault();
      const now=performance.now();if(now<lockedUntil)return;
      if(now-last>160)accumulated=0;last=now;
      accumulated+=(vertical?event.deltaY:event.deltaX)*(event.deltaMode===1?16:event.deltaMode===2?300:1);
      if(Math.abs(accumulated)>=36){callback.current(Math.sign(accumulated));accumulated=0;lockedUntil=now+200;}
    };
    element.addEventListener("wheel",wheel,{passive:false});
    return()=>element.removeEventListener("wheel",wheel);
  },[ref,vertical,enabled]);
}
function useDragInput({position,albums,onSelect,onDragStart}:Navigation,vertical:boolean) {
  const drag=useRef<{id:number;origin:number;position:number;last:number;time:number;velocity:number;moved:boolean;unit:number}|undefined>(undefined);
  const suppressClick=useRef(false);
  const coordinate=(event:PointerInput)=>vertical?event.clientY:event.clientX;
  const finish=(event:PointerInput<HTMLElement>)=>{
    const current=drag.current;if(!current||current.id!==event.pointerId)return;
    drag.current=undefined;
    if(current.moved){
      suppressClick.current=true;
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
      const inertia=performance.now()-current.time<100?current.velocity*100/current.unit:0;
      const destination=Math.round(position.get()-inertia);
      onSelect(Math.max(0,Math.min(albums.length-1,Math.max(Math.floor(current.position)-2,Math.min(Math.ceil(current.position)+2,destination)))));
    }
  };
  return {
    onPointerDown:(event:PointerInput<HTMLElement>)=>{
      if(event.button!==0)return;suppressClick.current=false;
      const coverSize=Math.min(innerHeight*.62,innerWidth*.352,680);
      const unit=vertical?parseFloat(getComputedStyle(event.currentTarget).getPropertyValue("--rail-step"))||80:innerWidth<640?Math.min(innerWidth*.7,innerHeight*.52)*.73:coverSize*.73;
      drag.current={id:event.pointerId,origin:coordinate(event),position:position.get(),last:coordinate(event),time:performance.now(),velocity:0,moved:false,unit};
    },
    onPointerMove:(event:PointerInput<HTMLElement>)=>{
      const current=drag.current;if(!current||current.id!==event.pointerId)return;
      const value=coordinate(event),distance=value-current.origin,now=performance.now();
      if(!current.moved&&Math.abs(distance)>7){current.moved=true;onDragStart();event.currentTarget.setPointerCapture(event.pointerId);}
      if(!current.moved)return;
      current.velocity=(value-current.last)/Math.max(1,now-current.time);current.last=value;current.time=now;
      position.set(Math.max(-.15,Math.min(albums.length-.85,current.position-distance/current.unit)));
    },
    onPointerUp:finish,
    onPointerCancel:(event:PointerInput<HTMLElement>)=>{if(drag.current)drag.current.velocity=0;finish(event);},
    onClickCapture:(event:MouseEvent<HTMLElement>)=>{
      if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}
    },
  };
}
function SpaceRecord({album,index,position,selected,isInfoOpen,onClick,reduced}:{
  album:Album;index:number;position:MotionValue<number>;selected:boolean;isInfoOpen:boolean;onClick:()=>void;reduced:boolean;
}) {
  const distance=useTransform(position,value=>index-value);
  const transform=useTransform(distance,value=>{
    const abs=Math.abs(value),sign=Math.sign(value);
    const x=abs<1?value*.76:sign*(.76+(abs-1)*.45);
    return `translateX(calc(var(--cover-size) * ${x})) translateZ(${-Math.min(abs,5)*(reduced?0:150)}px) rotateY(${reduced?0:-sign*Math.min(64,abs*52)}deg) scale(${Math.max(.32,1-Math.min(abs,4)*.22)})`;
  });
  const opacity=useTransform(distance,value=>Math.max(0,1-Math.abs(value)*.3));
  const filter=useTransform(distance,value=>`blur(${Math.min(7,Math.abs(value)*1.7)}px) brightness(${Math.max(.55,1-Math.abs(value)*.13)})`);
  const zIndex=useTransform(distance,value=>100-Math.round(Math.abs(value)*10));
  return <motion.div className="space-record" style={{transform,opacity,filter,zIndex}}>
    <motion.button className="space-cover-button" type="button" aria-label={selected?`${isInfoOpen?"关闭":"查看"}${album.title}专辑信息`:`切换到 ${album.title}`} aria-expanded={selected?isInfoOpen:undefined}
      tabIndex={selected?0:-1} onClick={onClick}
      animate={{scale:selected&&isInfoOpen ? .9 : 1,z:selected&&isInfoOpen&&!reduced ? -70 : 0,filter:selected&&isInfoOpen ? "blur(9px) brightness(.66)" : "blur(0px) brightness(1)"}}
      transition={{duration:reduced ? .12 : .52,ease:[.22,1,.36,1]}}>
      <AlbumCover source={album.coverUrl} title={album.title}/>
      <div className="space-reflection" aria-hidden="true"><AlbumCover source={album.coverUrl} title={album.title}/></div>
    </motion.button>
  </motion.div>;
}
export function AlbumCarousel(props:Navigation&{isInfoOpen:boolean;onInfo:()=>void;reduced:boolean}) {
  const container=useRef<HTMLDivElement>(null);useWheelInput(container,props.onStep,false);
  const drag=useDragInput(props,false),active=props.albums[props.activeAlbumIndex];
  return <div className="space-carousel" ref={container} {...drag} aria-label="专辑空间" aria-roledescription="轮播">
    <div className="space-orbit">
      {props.albums.map((album,index)=>Math.abs(index-props.activeAlbumIndex)<=5?
        <SpaceRecord key={album.id} album={album} index={index} position={props.position} selected={index===props.activeAlbumIndex} isInfoOpen={props.isInfoOpen}
          reduced={props.reduced} onClick={()=>index===props.activeAlbumIndex?props.onInfo():props.onSelect(index)}/>:null)}
    </div>
    <AnimatePresence>
      {props.isInfoOpen&&active&&<div className="space-info-position" key={active.id}><motion.div className="space-album-info" role="dialog" aria-label="专辑信息"
        initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}} transition={{duration:props.reduced ? .1 : .38,delay:.08}}>
        <h1>{active.title}</h1><p>{active.artist}</p>
      </motion.div></div>}
    </AnimatePresence>
  </div>;
}
function RailRecord({album,index,position,selected,onClick,open}:{album:Album;index:number;position:MotionValue<number>;selected:boolean;onClick:()=>void;open:boolean}) {
  const transform=useTransform(position,value=>`translate(-50%, -50%) translateY(calc(var(--rail-step) * ${index-value}))`);
  const opacity=useTransform(position,value=>Math.max(.35,1-Math.abs(index-value)*.055));
  return <motion.button type="button" className="space-rail-record" style={{transform,opacity}} aria-label={selected?`${album.title}，查看专辑信息`:`切换到 ${album.title}`} aria-current={selected?"true":undefined}
    tabIndex={open?0:-1} onClick={onClick}><AlbumCover source={album.coverUrl} title={album.title}/></motion.button>;
}
export function AlbumRail(props:Navigation&{open:boolean;onInfo:()=>void;reduced:boolean}) {
  const container=useRef<HTMLElement>(null);useWheelInput(container,props.onStep,true,props.open);
  const drag=useDragInput(props,true);
  return <motion.aside ref={container} id="album-rail" className="space-rail" aria-label="专辑滑轮" aria-hidden={!props.open}
    initial={false} animate={{x:props.open?0:"-100%"}} transition={{duration:props.reduced ? .1 : .42,ease:[.22,1,.36,1]}} {...drag}>
    <div className="space-rail-slot" aria-hidden="true"/>
    {props.albums.map((album,index)=>Math.abs(index-props.activeAlbumIndex)<=8?
      <RailRecord key={album.id} album={album} index={index} position={props.position} selected={index===props.activeAlbumIndex} open={props.open}
        onClick={()=>index===props.activeAlbumIndex?props.onInfo():props.onSelect(index)}/>:null)}
  </motion.aside>;
}
export function AlbumBackdrop({album,reduced}:{album?:Album;reduced:boolean}) {
  const [layers,setLayers]=useState<{key:number;source:string;url:string}[]>([]);
  const held=useRef(new Map<number,string>()),sequence=useRef(0);
  useEffect(()=>{
    const source=album?.coverUrl;if(!source)return;
    let cancelled=false;const key=++sequence.current;
    void(async()=>{
      let acquired=false;
      try{
        const url=await acquireMediaUrl(source);acquired=true;
        const image=new Image();image.src=url;await image.decode();
        if(cancelled){releaseMediaUrl(source);return;}
        held.current.set(key,source);setLayers(previous=>[...previous.slice(-1),{key,source,url}]);
      }catch{if(acquired)releaseMediaUrl(source);}
    })();
    return()=>{cancelled=true;};
  },[album?.coverUrl]);
  useEffect(()=>{
    const retained=new Set(layers.map(layer=>layer.key));
    for(const [key,source]of held.current)if(!retained.has(key)){releaseMediaUrl(source);held.current.delete(key);}
  },[layers]);
  useEffect(()=>{
    const leases=held.current;
    return()=>{for(const source of leases.values())releaseMediaUrl(source);leases.clear();};
  },[]);
  return <div className="space-backdrop" aria-hidden="true">
    {layers.map(layer=><motion.img key={layer.key} src={layer.url} alt="" className="space-background-image"
      initial={{opacity:0,scale:reduced?1:1.08}} animate={{opacity:1,scale:1}} transition={{duration:reduced ? .12 : .85,ease:"easeOut"}}
      onAnimationComplete={()=>setLayers(current=>current.at(-1)?.key===layer.key?current.slice(-1):current)}/>)}
    <div className="space-background-shade"/>
  </div>;
}
