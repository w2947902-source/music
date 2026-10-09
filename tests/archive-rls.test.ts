import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ADMIN = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const ALBUM = "20000000-0000-4000-8000-000000000001";
const DRAFT = "20000000-0000-4000-8000-000000000002";
const COVER = "30000000-0000-4000-8000-000000000001";
const AUDIO = "30000000-0000-4000-8000-000000000002";
const TRACK = "40000000-0000-4000-8000-000000000001";

test("PostgreSQL migration enforces UID, publication, private assets and transactional cleanup", async (t) => {
  const db = new PGlite();
  try {
    // Only the platform-owned auth/storage schema is simulated. The application's
    // entire migration, RLS, constraints, triggers and RPCs run in PostgreSQL.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public, auth, storage to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      grant select,insert,update,delete on storage.objects to anon, authenticated;
      insert into auth.users values ('${ADMIN}'), ('${OTHER}');
    `);
    await db.exec(await readFile("supabase/migrations/202610090001_archive.sql", "utf8"));
    await db.query("insert into archive_private.administrators(user_id) values ($1)", [ADMIN]);
    async function role(name: "anon" | "authenticated" | "postgres", uid = "") {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
      if (name !== "postgres") await db.exec(`set role ${name}`);
    }
    async function rows(sql: string, params: unknown[] = []) { return (await db.query<Record<string, unknown>>(sql, params)).rows; }
    const coverPath = `${ALBUM}/${COVER}.png`;
    const audioPath = `${ALBUM}/${AUDIO}.wav`;
    const album = {
      id: ALBUM, title: "Cloud record", artist: "Archive artist", published: false,
      cover_path: coverPath, featured_track_id: TRACK,
      tracks: [{ id: TRACK, title: "Excerpt", track_number: 1, audio_path: audioPath, duration: 30 }],
    };
    await role("authenticated", ADMIN);
    await t.test("the chosen UID can stage validated assets and upload immutable paths", async () => {
      await db.query("select archive_stage_media($1,$2,'cover','image/png',100,null)", [COVER, ALBUM]);
      await db.query("select archive_stage_media($1,$2,'audio','audio/wav',100,30)", [AUDIO, ALBUM]);
      await db.query("insert into storage.objects(bucket_id,name) values ('archive-media',$1),('archive-media',$2)", [coverPath,audioPath]);
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('archive-media','arbitrary-path.mp3')"), /row-level security/);
      await assert.rejects(db.query("select archive_stage_media(gen_random_uuid(),$1,'audio','audio/mpeg',100,30)", [ALBUM]), /constraint|null/);
      await assert.rejects(db.query("select archive_stage_media(gen_random_uuid(),$1,'audio','audio/wav',100,19)", [ALBUM]), /constraint/);
      await assert.rejects(db.query("select archive_stage_media(gen_random_uuid(),$1,'audio','audio/wav',100,null)", [ALBUM]), /constraint/);
      await assert.rejects(db.query("select archive_stage_media(gen_random_uuid(),$1,'cover','image/png',5242881,null)", [ALBUM]), /constraint/);
      assert.equal((await rows("update storage.objects set name='overwrite' returning name")).length, 0);
    });
    await db.query("select archive_save_album($1::jsonb,null)", [JSON.stringify(album)]);
    await db.query("select archive_save_album($1::jsonb,null)", [JSON.stringify({id:DRAFT,title:"Second draft",artist:"Artist",tracks:[]})]);
    await t.test("anonymous visitors cannot see drafts, their tracks or either asset", async () => {
      await role("anon");
      assert.deepEqual(await rows("select id from albums"), []);
      assert.deepEqual(await rows("select id from tracks"), []);
      assert.deepEqual(await rows("select name from storage.objects"), []);
      await assert.rejects(db.query("insert into albums(title,artist) values ('Attack','Visitor')"), /permission denied/);
      await assert.rejects(db.query("select archive_save_album('{}',null)"), /permission denied/);
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('archive-media','attack')"), /row-level security/);
      await assert.rejects(db.query("select * from archive_private.administrators"), /permission denied/);
    });
    await t.test("authenticated non-admin users cannot mutate or self-promote", async () => {
      await role("authenticated", OTHER);
      assert.deepEqual(await rows("select id from albums"), []);
      await assert.rejects(db.query("select archive_save_album($1::jsonb,null)", [JSON.stringify(album)]), /Administrator required/);
      await assert.rejects(db.query("insert into albums(title,artist) values ('Attack','User')"), /row-level security|Administrator required/);
      assert.deepEqual(await rows("update albums set published=true returning id"), []);
      assert.deepEqual(await rows("delete from albums returning id"), []);
      assert.deepEqual(await rows("delete from storage.objects returning name"), []);
      await assert.rejects(db.query("insert into archive_private.administrators(user_id) values ($1)", [OTHER]), /permission denied/);
    });
    await role("authenticated", ADMIN);
    const initialVersion = (await rows("select updated_at::text as version from albums where id=$1", [ALBUM]))[0] as {version:string};
    await db.query("select archive_set_published($1,true,$2)", [ALBUM,initialVersion.version]);
    await t.test("all anonymous sessions read only the same published database and referenced media", async () => {
      await role("anon");
      assert.equal((await rows("select id from albums")).length,1);
      assert.equal((await rows("select id from tracks")).length,1);
      assert.equal((await rows("select name from storage.objects")).length,2);
      await role("authenticated", OTHER);
      assert.equal((await rows("select id from albums")).length,1);
    });
    await t.test("publication changes revoke new anonymous media access", async () => {
      await role("authenticated", ADMIN);
      const v = (await rows("select updated_at::text as v from albums where id=$1", [ALBUM]))[0] as {v:string};
      await db.query("select archive_set_published($1,false,$2)", [ALBUM,v.v]);
      await role("anon");
      assert.deepEqual(await rows("select name from storage.objects"),[]);
    });
    await t.test("stale edits, duplicate orders and invalid replacement tracks roll back", async () => {
      await role("authenticated", ADMIN);
      await assert.rejects(db.query("select archive_save_album($1::jsonb,$2)", [JSON.stringify({...album,title:"Stale edit"}),initialVersion.version]), /another window/);
      await assert.rejects(db.query("select archive_reorder_albums($1::uuid[])", [[ALBUM,ALBUM]]), /list changed/);
      const v = (await rows("select updated_at::text as v from albums where id=$1", [ALBUM]))[0] as {v:string};
      await assert.rejects(db.query("select archive_save_album($1::jsonb,$2)", [JSON.stringify({...album,title:"Failed edit",tracks:[{...album.tracks[0],duration:25}]}),v.v]), /duration does not match/);
      assert.equal((await rows("select title from albums where id=$1",[ALBUM]))[0]?.title,"Cloud record");
      assert.equal((await rows("select duration from tracks where id=$1",[TRACK]))[0]?.duration,30);
      await db.query("select archive_reorder_albums($1::uuid[])", [[DRAFT,ALBUM]]);
      assert.equal((await rows("select id from albums order by display_order"))[0]?.id,DRAFT);
    });
    await t.test("database removal queues files; cleanup blocks reuse and safely retries", async () => {
      const v = (await rows("select updated_at::text as v from albums where id=$1", [ALBUM]))[0] as {v:string};
      await db.query("select archive_delete_album($1,$2)", [ALBUM,v.v]);
      assert.equal((await rows("select * from archive_media_gc")).length,2);
      assert.equal((await rows("select archive_claim_media_cleanup()")).length,2);
      assert.equal((await rows("select archive_claim_media_cleanup()")).length,2);
      await assert.rejects(db.query("select archive_save_album($1::jsonb,null)",[JSON.stringify(album)]), /Invalid or missing/);
      await db.query("select archive_finish_media_cleanup($1::text[])", [[coverPath,audioPath]]);
      assert.equal((await rows("select * from media_assets")).length,2, "catalog stays until Storage API removed objects");
      await db.exec("delete from storage.objects"); // Simulates the successful Storage DELETE API metadata step.
      await db.query("select archive_finish_media_cleanup($1::text[])", [[coverPath,audioPath]]);
      assert.equal((await rows("select * from media_assets")).length,0);
      assert.equal((await rows("select * from archive_media_gc")).length,0);
    });
  } finally { await db.close(); }
});
