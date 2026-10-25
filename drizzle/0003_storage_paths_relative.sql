-- storage_path is now relative to the storage root (STORAGE_DIR):
-- "storage/documents/<id>.pdf" -> "documents/<id>.pdf"
UPDATE "documents" SET "storage_path" = regexp_replace("storage_path", '^storage/', '');
