"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, MotionConfig, useMotionValue, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, CircleUserRound, Loader2, Pause, Play, Repeat, Repeat1, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { ArchiveMode } from "@/lib/supabase/albumRepository";
import { useAlbums } from "@/lib/albums/useAlbums";
import { useAudioPlayer } from "@/lib/audio/useAudioPlayer";
import { acquireMediaUrl, releaseMediaUrl } from "@/lib/storage/mediaUrls";
import { AlbumBackdrop, AlbumCarousel, AlbumRail } from "./AlbumSpace";

export function Gallery({mode="public"}:{mode?:ArchiveMode}) {
  const {albums,loading,error,refresh}=useAlbums(mode);
  const previewId=useSearchParams().get("album");
  // One stable selection; every component derives its index from the same array.
  const [activeAlbumId,setActiveAlbumId]=useState<string>();
  const activeAlbumIndex=Math.max(0,albums.findIndex(album=>album.id===(activeAlbumId??previewId)));
  const album=albums[activeAlbumIndex];
  const [isSidebarOpen,setIsSidebarOpen]=useState(false);
  const [isInfoOpen,setIsInfoOpen]=useState(false);
  const [isTransitioning,setIsTransitioning]=useState(false);
  const [isMuted,setIsMuted]=useState(false);
  const [loopMode,setLoopMode]=useState<"single"|"list">("single");
  const {state,manager}=useAudioPlayer(album);
  const reduced=Boolean(useReducedMotion());
  const position=useMotionValue(activeAlbumIndex);
  const currentIndex=useRef(activeAlbumIndex),initialized=useRef(false);
  const animation=useRef<ReturnType<typeof animate>|null>(null);
  const transitionSequence=useRef(0);
  const isPlaying=state.playingIntent;
  const snap=useCallback((index:number)=>{
    animation.current?.stop();
    const sequence=++transitionSequence.current;
    setIsTransitioning(true);
    animation.current=animate(position,index,{
      ...(reduced?{duration:.12}:{type:"spring" as const,stiffness:125,damping:24,mass:.9}),
      onComplete:()=>{if(sequence===transitionSequence.current)setIsTransitioning(false);},
    });
  },[position,reduced]);
  useEffect(()=>{
    currentIndex.current=activeAlbumIndex;
    if(!albums.length)return;
    if(!initialized.current){position.set(activeAlbumIndex);initialized.current=true;}
    else snap(activeAlbumIndex);
    return()=>animation.current?.stop();
  },[activeAlbumIndex,albums.length,position,snap]);
  useEffect(()=>{if(album&&activeAlbumId!==album.id)setActiveAlbumId(album.id);},[album,activeAlbumId]);
  const select=useCallback((index:number)=>{
    const next=Math.max(0,Math.min(albums.length-1,index));
    if(!albums[next])return;
    setIsInfoOpen(false);
    if(next===currentIndex.current)snap(next);
    currentIndex.current=next;setActiveAlbumId(albums[next].id);
  },[albums,snap]);
  const step=useCallback((direction:number)=>select(currentIndex.current+direction),[select]);
  useEffect(()=>{
    manager.setLoopMode(loopMode,()=>{
      for(let offset=1;offset<=albums.length;offset++){
        const next=(currentIndex.current+offset)%albums.length;
        if(albums[next]?.tracks.some(track=>Boolean(track.audioUrl))){
          if(next===currentIndex.current)return false;
          select(next);
          return true;
        }
      }
      return false;
    });
    return()=>manager.setLoopMode("single");
  },[loopMode,albums,select,manager]);
  const toggleInfo=useCallback(()=>setIsInfoOpen(open=>!open),[]);
  const dragStart=useCallback(()=>{animation.current?.stop();setIsInfoOpen(false);setIsTransitioning(true);},[]);
  useEffect(()=>{manager.setVolume(isMuted?0:.7);},[isMuted,manager]);
  useEffect(()=>{
    const unlock=(event:Event)=>{
      if((event.target as HTMLElement)?.closest?.(".space-play-toggle"))return;
      if(event instanceof KeyboardEvent&&event.code==="Space")return;
      const snapshot=manager.getSnapshot();
      if(snapshot.playingIntent&&snapshot.status!=="playing")void manager.play();
    };
    document.addEventListener("pointerdown",unlock,{capture:true});
    document.addEventListener("keydown",unlock,{capture:true});
    return()=>{document.removeEventListener("pointerdown",unlock,true);document.removeEventListener("keydown",unlock,true);};
  },[manager]);
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if(event.altKey||event.ctrlKey||event.metaKey||/INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement)?.tagName)||(event.target as HTMLElement)?.isContentEditable)return;
      if(event.key==="Escape")setIsInfoOpen(false);
      if(event.key==="ArrowLeft"||isSidebarOpen&&event.key==="ArrowUp"){event.preventDefault();step(-1);}
      if(event.key==="ArrowRight"||isSidebarOpen&&event.key==="ArrowDown"){event.preventDefault();step(1);}
      if(event.code==="Space"&&(event.target===document.body||event.target===document.documentElement)){
        event.preventDefault();if(state.playingIntent&&!state.autoplayBlocked)manager.pause();else void manager.play();
      }
    };
    window.addEventListener("keydown",keyboard);return()=>window.removeEventListener("keydown",keyboard);
  },[isSidebarOpen,step,manager,state.playingIntent,state.autoplayBlocked]);
  useEffect(()=>{
    const adjacent=albums.slice(Math.max(0,activeAlbumIndex-1),activeAlbumIndex+2);
    const sources=[...new Set(adjacent.map(item=>item.coverUrl).filter(Boolean))];
    const held:string[]=[];let cancelled=false;
    for(const source of sources)void acquireMediaUrl(source).then(url=>{
      if(cancelled){releaseMediaUrl(source);return;}
      held.push(source);
      const image=new Image();image.src=url;void image.decode().catch(()=>{});
    }).catch(()=>{});
    return()=>{cancelled=true;held.forEach(releaseMediaUrl);};
  },[albums,activeAlbumIndex]);
  useEffect(()=>{
    if(!albums.length||(state.status!=="playing"&&state.status!=="paused"))return;
    const connection=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    if(connection?.saveData||connection?.effectiveType?.includes("2g"))return;
    const neighbors=[albums[(activeAlbumIndex+1)%albums.length],albums[(activeAlbumIndex-1+albums.length)%albums.length]];
    const sources=[...new Set(neighbors.filter(item=>item.id!==album?.id).map(item=>item.tracks[0]?.audioUrl).filter((source):source is string=>Boolean(source)))];
    let cancelled=false;
    // Warm audio after the current excerpt is ready, so its download gets priority.
    const timer=setTimeout(()=>void(async()=>{
      for(const source of sources){
        if(cancelled)break;
        try{await acquireMediaUrl(source);releaseMediaUrl(source);}catch{/* Retry normally when selected. */}
      }
    })(),150);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[albums,activeAlbumIndex,album?.id,state.status]);
  useEffect(()=>{
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30000);
    return()=>clearInterval(timer);
  },[refresh]);
  const navigation={albums,activeAlbumIndex,position,onSelect:select,onStep:step,onDragStart:dragStart};
  return <MotionConfig reducedMotion="user"><main className="listening-space" data-active-album={album?.id} data-active-index={activeAlbumIndex} data-transitioning={isTransitioning}>
    <AlbumBackdrop album={album} reduced={reduced}/>
    {album&&<>
      <AlbumCarousel {...navigation} isInfoOpen={isInfoOpen} onInfo={toggleInfo} reduced={reduced}/>
      <AlbumRail {...navigation} open={isSidebarOpen} onInfo={toggleInfo} reduced={reduced}/>
      <motion.button className="space-rail-toggle" initial={false} animate={{x:isSidebarOpen?"var(--rail-width)":0}}
        transition={{duration:reduced?.1:.42,ease:[.22,1,.36,1]}} onClick={()=>setIsSidebarOpen(open=>!open)}
        aria-controls="album-rail" aria-expanded={isSidebarOpen} aria-label={isSidebarOpen?"收起专辑滑轮":"展开专辑滑轮"}>
        {isSidebarOpen?<ChevronLeft size={25} strokeWidth={1.2}/>:<ChevronRight size={25} strokeWidth={1.2}/>}
      </motion.button>
      <div className="space-audio-controls">
        <button className="space-icon-button space-play-toggle" aria-label={state.status==="error"?"重试播放":isPlaying&&!state.autoplayBlocked?"暂停音乐":"播放音乐"}
          onClick={()=>{if(state.status==="error"){void manager.play();void manager.select(album);}else if(isPlaying&&!state.autoplayBlocked)manager.pause();else void manager.play();}}>
          {state.status==="loading"?<Loader2 size={19} className="space-spinner"/>:state.status==="error"?<RotateCcw size={19}/>:isPlaying&&!state.autoplayBlocked?<Pause size={19}/>:<Play size={19}/>}
        </button>
        <button className="space-icon-button" title={loopMode==="single"?"单曲循环 · 点击切换列表循环":"列表循环 · 点击切换单曲循环"}
          aria-label={loopMode==="single"?"当前单曲循环，切换为列表循环":"当前列表循环，切换为单曲循环"}
          aria-pressed={loopMode==="list"} onClick={()=>setLoopMode(mode=>mode==="single"?"list":"single")}>
          {loopMode==="single"?<Repeat1 size={19}/>:<Repeat size={19}/>}
        </button>
        <button className="space-icon-button" aria-label={isMuted?"取消静音":"静音"} aria-pressed={isMuted} onClick={()=>setIsMuted(value=>!value)}>
          {isMuted?<VolumeX size={19}/>:<Volume2 size={19}/>}
        </button>
      </div>
    </>}
    <Link className="space-admin-link space-icon-button" href="/admin" aria-label={mode==="admin"?"返回管理员后台":"管理员登录"}><CircleUserRound size={24} strokeWidth={1.3}/></Link>
    {loading&&!album&&<div className="space-status" role="status"><Loader2 size={24} className="space-spinner"/><span className="sr-only">正在加载专辑</span></div>}
    {error&&<div className="space-notice" role="alert">{error}<button onClick={()=>void refresh()} aria-label="重新加载专辑"><RotateCcw size={16}/></button></div>}
    {!loading&&!album&&!error&&<div className="space-status"><p>暂无已发布专辑</p></div>}
  </main></MotionConfig>;
}
