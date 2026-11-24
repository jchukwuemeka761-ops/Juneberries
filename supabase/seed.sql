-- Juneberry International Schools — Controlled Initial Configuration Seed
INSERT INTO public.school_settings (
  id, school_name, motto, address, email, phone, logo_url, grading_scale
) VALUES (
  'settings_default',
  'Juneberry International Schools',
  'Integrity, Scholarship & Global Excellence',
  'Plot 14, Admiralty Way, Lekki Phase 1, Lagos, Nigeria',
  'registrar@juneberryschools.edu.ng',
  '+234 (0) 800 586 3237',
  '/images/juneberry_crest.jpg',
  '[{"grade":"A","minScore":70,"maxScore":100,"remark":"Distinction"},{"grade":"B","minScore":60,"maxScore":69,"remark":"Very Good"},{"grade":"C","minScore":50,"maxScore":59,"remark":"Credit"},{"grade":"D","minScore":45,"maxScore":49,"remark":"Pass"},{"grade":"E","minScore":40,"maxScore":44,"remark":"Fair"},{"grade":"F","minScore":0,"maxScore":39,"remark":"Needs Improvement"}]'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.departments (name, code, description) VALUES
  ('Nursery & Primary Department', 'PRI', 'Primary 1 to Primary 6 academic coordination'),
  ('Junior Secondary Department', 'JSS', 'JSS 1 to JSS 3 BECE academic coordination'),
  ('Senior Secondary Department', 'SSS', 'SSS 1 to SSS 3 WAEC/NECO academic coordination'),
  ('Science & Technology Department', 'SCI', 'Mathematics, Physics, Chemistry, Biology, ICT'),
  ('Arts & Humanities Department', 'ART', 'English Language, Literature, Government, Civic Education'),
  ('Commercial & Business Department', 'COM', 'Economics, Financial Accounting, Commerce, Business Studies')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.classes (name, code, level_group, level_order, capacity) VALUES
  ('Primary 1', 'PRY1', 'primary', 1, 35),
  ('Primary 2', 'PRY2', 'primary', 2, 35),
  ('Primary 3', 'PRY3', 'primary', 3, 35),
  ('Primary 4', 'PRY4', 'primary', 4, 35),
  ('Primary 5', 'PRY5', 'primary', 5, 35),
  ('Primary 6', 'PRY6', 'primary', 6, 35),
  ('JSS 1', 'JSS1', 'junior_secondary', 7, 40),
  ('JSS 2', 'JSS2', 'junior_secondary', 8, 40),
  ('JSS 3', 'JSS3', 'junior_secondary', 9, 40),
  ('SSS 1', 'SSS1', 'senior_secondary', 10, 40),
  ('SSS 2', 'SSS2', 'senior_secondary', 11, 40),
  ('SSS 3', 'SSS3', 'senior_secondary', 12, 40)
ON CONFLICT (code) DO NOTHING;
