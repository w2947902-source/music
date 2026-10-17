import assert from "node:assert/strict";
import { test } from "node:test";
import { albumAtRatio, albumForTrack, groupAlbums, nextUnplayedTrack } from "../lib/albums/catalogue";
import type { Album, Track } from "../types/album";

const track=(id:string,title:string,audioUrl=`/${id}.wav`):Track=>({id,title,audioUrl,trackNumber:1,duration:30});
const album=(id:string,title:string,artist:string,tracks:Track[],published=true):Album=>({id,title,artist,tracks,published,coverUrl:"",order:0});

test("same album and artist group across case/spacing; duplicate titles keep one stable playable version",()=>{
  const a=album("a"," Illinois ","Sufjan Stevens",[track("z","Chicago"),track("n","Casimir Pulaski Day")]);
  const b=album("b","ILLINOIS","Sufjan   Stevens",[track("b"," chicago "),track("x","Chicago",""),track("l","John Wayne Gacy, Jr.")]);
  const otherArtist=album("c","Illinois","Different Artist",[track("other","Chicago")]);
  const draft=album("d","Illinois","Sufjan Stevens",[track("private","Draft Song")],false);
  const grouped=groupAlbums([a,b,otherArtist,draft]);
  assert.equal(grouped.length,3);
  assert.deepEqual(grouped[0].tracks.map(song=>song.id),["b","n","l"]);
  assert.deepEqual(grouped[0].sourceAlbumIds,["a","b"]);
  assert.equal(a.tracks.length,2);
  const reversed=groupAlbums([b,a]);
  assert.equal(reversed[0].id,grouped[0].id);
  assert.equal(reversed[0].tracks.find(song=>song.title.trim().toLowerCase()==="chicago")?.id,"b");
  assert.equal(grouped[0].tracks.some(song=>song.id==="private"),false);
});

test("manual start in the middle still completes all unplayed songs before leaving the album",()=>{
  const record=album("a","Collection","Artist",[track("one","One"),track("silent","No Clip",""),track("two","Two"),track("three","Three")]);
  const completed=new Set(["two"]);
  assert.equal(nextUnplayedTrack(record,"two",completed)?.id,"three");
  completed.add("three");
  assert.equal(nextUnplayedTrack(record,"three",completed)?.id,"one");
  completed.add("one");
  assert.equal(nextUnplayedTrack(record,"one",completed),undefined);
  const selected=albumForTrack(record,record.tracks[3])!;
  assert.deepEqual(selected.tracks.map(song=>song.id),["three"]);
  assert.deepEqual(selected.backgroundAudio,{trackId:"three",start:0,end:30});
});

test("range navigation maps compressed positions proportionally, including both ends",()=>{
  assert.equal(albumAtRatio(0,258),0);
  assert.equal(albumAtRatio(.5,258),129);
  assert.equal(albumAtRatio(1,258),257);
  assert.equal(albumAtRatio(-2,258),0);
  assert.equal(albumAtRatio(2,258),257);
  assert.equal(albumAtRatio(.7,1),0);
  assert.equal(albumAtRatio(.7,0),0);
});
