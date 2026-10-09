export type AlbumRow = {
  id: string; title: string; artist: string; release_year: number | null;
  cover_path: string | null; description: string; background_color: string;
  display_order: number; published: boolean; featured_track_id: string | null;
  created_at: string; updated_at: string;
};
export type TrackRow = {
  id: string; album_id: string; title: string; track_number: number;
  audio_path: string | null; duration: number | null; created_at: string; updated_at: string;
};
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export interface Database {
  public: {
    Tables: { albums: Table<AlbumRow>; tracks: Omit<Table<TrackRow>, "Relationships"> & { Relationships: [{ foreignKeyName: "tracks_album_id_fkey"; columns: ["album_id"]; isOneToOne: false; referencedRelation: "albums"; referencedColumns: ["id"] }] } };
    Views: Record<string, never>;
    Functions: {
      is_archive_admin: { Args: Record<string, never>; Returns: boolean };
      archive_stage_media: { Args: { p_id: string; p_album_id: string; p_kind: string; p_mime_type: string; p_byte_size: number; p_duration?: number | null }; Returns: string };
      archive_save_album: { Args: { p_album: Json; p_expected_updated_at?: string | null }; Returns: string };
      archive_set_published: { Args: { p_id: string; p_published: boolean; p_expected_updated_at: string }; Returns: undefined };
      archive_delete_album: { Args: { p_id: string; p_expected_updated_at: string }; Returns: undefined };
      archive_reorder_albums: { Args: { p_ids: string[] }; Returns: undefined };
      archive_claim_media_cleanup: { Args: Record<string, never>; Returns: string[] };
      archive_finish_media_cleanup: { Args: { p_paths: string[] }; Returns: undefined };
      archive_abandon_media: { Args: { p_paths: string[] }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
