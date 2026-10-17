"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, MotionConfig, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ChevronLeft, ChevronRight, CircleUserRound, Loader2, Pause, Play, Repeat, Repeat1, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { ArchiveMode } from "@/lib/supabase/albumRepository";
import { useAlbums } from "@/lib/albums/useAlbums";
import { albumForTrack, groupAlbums, nextUnplayedTrack, playableTracks } from "@/lib/albums/catalogue";
import { useAudioPlayer } from "@/lib/audio/useAudioPlayer";
import { acquireMediaUrl, releaseMediaUrl } from "@/lib/storage/mediaUrls";
import { AlbumBackdrop, AlbumCarousel, AlbumRail } from "./AlbumSpace";
import { AlbumScrubber } from "./AlbumScrubber";

export function Gallery({mode="public"}:{mode?:ArchiveMode}) {
  const {albums:records,loading,error,refresh}=useAlbums(mode);
  const albums=useMemo(()=>groupAlbums(records),[records]);
  const previewId=useSearchParams().get("album");
  // One stable selection; every component derives its index from the same array.
  const [activeAlbumId,setActiveAlbumId]=useState<string>();
  const activeAlbumIndex=Math.max(0,albums.findIndex(album=>album.id===(activeAlbumId??previewId)||!activeAlbumId&&Boolean(previewId&&album.sourceAlbumIds?.includes(previewId))));
  const album=albums[activeAlbumIndex];
  const [activeTrackId,setActiveTrackId]=useState<string>();
  const requestedTrackId=activeTrackId??records.find(record=>record.id===previewId)?.backgroundAudio?.trackId;
  const activeTrack=playableTracks(album).find(track=>track.id===requestedTrackId)??playableTracks(album)[0]??album?.tracks[0];
  const playbackAlbum=useMemo(()=>albumForTrack(album,activeTrack),[album,activeTrack]);
  const [isSidebarOpen,setIsSidebarOpen]=useState(false);
  const [infoPage,setInfoPage]=useState<0|1|2>(0);
  const [isTransitioning,setIsTransitioning]=useState(false);
  const [isMuted,setIsMuted]=useState(false);
  const [loopMode,setLoopMode]=useState<"single"|"list">("list");
  const {state,manager}=useAudioPlayer(playbackAlbum);
  const reduced=Boolean(useReducedMotion());
  const position=useMotionValue(activeAlbumIndex);
  const currentIndex=useRef(activeAlbumIndex),initialized=useRef(false);
  const animation=useRef<ReturnType<typeof animate>|null>(null);
  const transitionSequence=useRef(0);
  const currentTrackId=useRef(activeTrack?.id),completedTracks=useRef(new Set<string>()),playlistAlbum=useRef(album?.id);
  const skipNextSnap=useRef(false),jumpSequence=useRef(0),jumping=useRef(false);
  const [isJumping,setIsJumping]=useState(false);
  const sceneBlur=useMotionValue(0),sceneOpacity=useMotionValue(1);
  const sceneFilter=useTransform(sceneBlur,value=>`blur(${value}px)`);
  const jumpAnimations=useRef<ReturnType<typeof animate>[]>([]);
  const jumpAbort=useRef<AbortController|undefined>(undefined),latestAlbums=useRef(albums);
  useEffect(()=>{latestAlbums.current=albums;},[albums]);
  const isPlaying=state.playingIntent;
  const cancelJump=useCallback((reset=true)=>{
    jumpSequence.current++;jumpAbort.current?.abort();jumpAbort.current=undefined;
    jumpAnimations.current.forEach(control=>control.stop());jumpAnimations.current=[];
    if(reset){jumping.current=false;sceneBlur.set(0);sceneOpacity.set(1);setIsJumping(false);setIsTransitioning(false);}
  },[sceneBlur,sceneOpacity]);
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
    if(!initialized.current||skipNextSnap.current||jumping.current){position.set(activeAlbumIndex);initialized.current=true;skipNextSnap.current=false;}
    else snap(activeAlbumIndex);
    return()=>animation.current?.stop();
  },[activeAlbumIndex,albums.length,position,snap]);
  useEffect(()=>{if(album&&activeAlbumId!==album.id)setActiveAlbumId(album.id);},[album,activeAlbumId]);
  useEffect(()=>{
    currentTrackId.current=activeTrack?.id;
    if(playlistAlbum.current!==album?.id){playlistAlbum.current=album?.id;completedTracks.current.clear();setInfoPage(0);}
  },[album?.id,activeTrack?.id]);
  const select=useCallback((index:number)=>{
    cancelJump();
    const next=Math.max(0,Math.min(albums.length-1,index));
    if(!albums[next])return;
    setInfoPage(0);
    if(next===currentIndex.current)snap(next);
    if(albums[next].id!==playlistAlbum.current){
      completedTracks.current.clear();playlistAlbum.current=albums[next].id;
      const first=playableTracks(albums[next])[0];currentTrackId.current=first?.id;setActiveTrackId(first?.id);
    }
    currentIndex.current=next;setActiveAlbumId(albums[next].id);
  },[albums,snap,cancelJump]);
  const step=useCallback((direction:number)=>select(currentIndex.current+direction),[select]);
  const selectTrack=useCallback((id:string,manual=true)=>{
    const selected=albums[currentIndex.current]?.tracks.find(track=>track.id===id&&track.audioUrl);
    if(!selected)return;
    if(manual){
      if(id===currentTrackId.current){if(!manager.getSnapshot().playingIntent||manager.getSnapshot().autoplayBlocked)void manager.play();return;}
      manager.enablePlayback();
    }
    currentTrackId.current=id;setActiveTrackId(id);
  },[albums,manager]);
  useEffect(()=>{
    manager.setLoopMode(loopMode,(finishedId)=>{
      if(jumping.current||finishedId!==currentTrackId.current)return false;
      const current=albums[currentIndex.current];if(!current)return false;
      completedTracks.current.add(finishedId);
      const nextTrack=nextUnplayedTrack(current,finishedId,completedTracks.current);
      if(nextTrack){selectTrack(nextTrack.id,false);return true;}
      for(let offset=1;offset<=albums.length;offset++){
        const next=(currentIndex.current+offset)%albums.length;
        if(albums[next]?.tracks.some(track=>Boolean(track.audioUrl))){
          if(next===currentIndex.current){
            completedTracks.current.clear();
            const first=playableTracks(current)[0];
            if(first&&first.id!==finishedId){selectTrack(first.id,false);return true;}
            return false;
          }
          select(next);
          return true;
        }
      }
      return false;
    });
    return()=>manager.setLoopMode("single");
  },[loopMode,albums,select,selectTrack,manager]);
  const toggleInfo=useCallback(()=>setInfoPage(page=>((page+1)%3) as 0|1|2),[]);
  const dragStart=useCallback(()=>{cancelJump();animation.current?.stop();setInfoPage(0);setIsTransitioning(true);},[cancelJump]);
  const jump=useCallback(async(index:number)=>{
    const target=albums[index];if(!target)return;
    setInfoPage(0);
    if(index===currentIndex.current){cancelJump();return;}
    cancelJump(false);
    const sequence=++jumpSequence.current;jumping.current=true;setIsJumping(true);
    const controller=new AbortController();jumpAbort.current=controller;
    const aborted=new Promise<void>(resolve=>controller.signal.addEventListener("abort",()=>resolve(),{once:true}));
    animation.current?.stop();setIsTransitioning(true);
    let timeout:ReturnType<typeof setTimeout>|undefined;
    const cover=(async()=>{
      if(!target.coverUrl)return;
      try{const url=await acquireMediaUrl(target.coverUrl);try{const image=new Image();image.src=url;await image.decode();}finally{releaseMediaUrl(target.coverUrl);}}catch{/* The regular cover component provides its fallback. */}
    })();
    jumpAnimations.current=[animate(sceneBlur,reduced?0:22,{duration:reduced?.08:.24}),animate(sceneOpacity,.42,{duration:reduced?.08:.24})];
    await Promise.race([Promise.all([...jumpAnimations.current,Promise.race([cover,new Promise<void>(resolve=>{timeout=setTimeout(resolve,1800);})])]),aborted]);
    if(timeout)clearTimeout(timeout);
    if(sequence!==jumpSequence.current)return;
    const destination=latestAlbums.current.findIndex(item=>item.id===target.id);
    if(destination<0){cancelJump();return;}
    const currentTarget=latestAlbums.current[destination];
    skipNextSnap.current=true;position.set(destination);currentIndex.current=destination;
    completedTracks.current.clear();playlistAlbum.current=target.id;
    const first=playableTracks(currentTarget)[0];currentTrackId.current=first?.id;setActiveTrackId(first?.id);setActiveAlbumId(currentTarget.id);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    if(sequence!==jumpSequence.current)return;
    jumpAnimations.current=[animate(sceneBlur,0,{duration:reduced?.1:.46,ease:[.22,1,.36,1]}),animate(sceneOpacity,1,{duration:reduced?.1:.46})];
    await Promise.race([Promise.all(jumpAnimations.current),aborted]);
    if(sequence===jumpSequence.current){jumpAbort.current=undefined;jumping.current=false;setIsJumping(false);setIsTransitioning(false);}
  },[albums,cancelJump,position,reduced,sceneBlur,sceneOpacity]);
  useEffect(()=>()=>{jumpSequence.current++;jumpAbort.current?.abort();jumpAnimations.current.forEach(control=>control.stop());},[]);
  useEffect(()=>{manager.setVolume(isMuted?0:.7);},[isMuted,manager]);
  useEffect(()=>{
    const unlock=(event:Event)=>{
      if((event.target as HTMLElement)?.closest?.(".space-play-toggle,.space-track-option"))return;
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
      if(event.key==="Escape")setInfoPage(0);
      if((event.target as HTMLElement)?.closest?.(".space-range-navigation,.space-track-list"))return;
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
    const tracks=playableTracks(album),trackIndex=tracks.findIndex(track=>track.id===activeTrack?.id);
    const nextTrack=tracks.length>1?tracks[(trackIndex+1)%tracks.length]:undefined;
    const sources=[...new Set([nextTrack?.audioUrl,...neighbors.filter(item=>item.id!==album?.id).map(item=>playableTracks(item)[0]?.audioUrl)].filter((source):source is string=>Boolean(source)))];
    let cancelled=false;
    // Warm audio after the current excerpt is ready, so its download gets priority.
    const timer=setTimeout(()=>void(async()=>{
      for(const source of sources){
        if(cancelled)break;
        try{await acquireMediaUrl(source);releaseMediaUrl(source);}catch{/* Retry normally when selected. */}
      }
    })(),150);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[albums,activeAlbumIndex,album,activeTrack?.id,state.status]);
  useEffect(()=>{
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30000);
    return()=>clearInterval(timer);
  },[refresh]);
  const navigation={albums,activeAlbumIndex,position,onSelect:select,onStep:step,onDragStart:dragStart};
  return <MotionConfig reducedMotion="user"><main className="listening-space" data-active-album={album?.id} data-active-track={activeTrack?.id} data-active-index={activeAlbumIndex} data-info-page={infoPage} data-transitioning={isTransitioning}>
    <motion.div className={`space-scene${isJumping?" is-jumping":""}`} style={{filter:sceneFilter,opacity:sceneOpacity}}>
    <AlbumBackdrop album={album} reduced={reduced} instant={isJumping}/>
    {album&&<>
      <AlbumCarousel {...navigation} infoPage={infoPage} onInfo={toggleInfo} reduced={reduced}
        activeTrackId={activeTrack?.id} playing={isPlaying&&!state.autoplayBlocked} onTrackSelect={selectTrack}/>
      <AlbumRail {...navigation} open={isSidebarOpen} onInfo={toggleInfo} reduced={reduced}/>
      <motion.button className="space-rail-toggle" initial={false} animate={{x:isSidebarOpen?"var(--rail-width)":0}}
        transition={{duration:reduced?.1:.42,ease:[.22,1,.36,1]}} onClick={()=>setIsSidebarOpen(open=>!open)}
        aria-controls="album-rail" aria-expanded={isSidebarOpen} aria-label={isSidebarOpen?"收起专辑滑轮":"展开专辑滑轮"}>
        {isSidebarOpen?<ChevronLeft size={25} strokeWidth={1.2}/>:<ChevronRight size={25} strokeWidth={1.2}/>}
      </motion.button>
    </>}
    </motion.div>
    {album&&<>
      <AlbumScrubber albums={albums} activeAlbumIndex={activeAlbumIndex} onJump={index=>void jump(index)} reduced={reduced}/>
      <div className="space-audio-controls">
        <button className="space-icon-button space-play-toggle" aria-label={state.status==="error"?"重试播放":isPlaying&&!state.autoplayBlocked?"暂停音乐":"播放音乐"}
          onClick={()=>{if(state.status==="error"){void manager.enablePlayback();void manager.select(playbackAlbum);}else if(isPlaying&&!state.autoplayBlocked)manager.pause();else void manager.play();}}>
          {state.status==="loading"?<Loader2 size={19} className="space-spinner"/>:state.status==="error"?<RotateCcw size={19}/>:isPlaying&&!state.autoplayBlocked?<Pause size={19}/>:<Play size={19}/>}
        </button>
        <button className="space-icon-button" title={loopMode==="single"?"单曲循环 · 点击切换专辑连播":"专辑连播 · 播完本专辑全部歌曲后进入下一张"}
          aria-label={loopMode==="single"?"当前单曲循环，切换为专辑连播":"当前专辑连播，切换为单曲循环"}
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
