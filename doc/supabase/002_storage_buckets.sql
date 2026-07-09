-- Too-Yen storage buckets — public per ADR-009
insert into storage.buckets (id, name, public)
values
  ('recipe-media', 'recipe-media', true),     -- recipe gallery images + video + step images
  ('avatars', 'avatars', true),               -- user profile pictures
  ('comment-images', 'comment-images', true)  -- comment attachments (1 per comment)
on conflict (id) do nothing;
