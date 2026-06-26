-- Demo grant seed — run this in Supabase SQL Editor to populate Discovery
-- with 10 realistic opportunities so you can test tier gating without a real profile.
-- Safe to re-run (uses ON CONFLICT DO NOTHING on name for funders).

DO $$
DECLARE
  fid_rwjf   uuid; fid_casey  uuid; fid_epa    uuid;
  fid_usda   uuid; fid_kellogg uuid; fid_jpmc  uuid;
  fid_enter  uuid; fid_mozilla uuid; fid_irc   uuid;
  fid_nea    uuid;
BEGIN

-- Insert funders
INSERT INTO public.funders (name, funder_type) VALUES
  ('Robert Wood Johnson Foundation', 'foundation'),
  ('Annie E. Casey Foundation', 'foundation'),
  ('EPA Office of Environmental Justice', 'federal'),
  ('USDA Community Food Projects', 'federal'),
  ('W.K. Kellogg Foundation', 'foundation'),
  ('JP Morgan Chase Foundation', 'corporate'),
  ('Enterprise Community Partners', 'foundation'),
  ('Mozilla Foundation', 'foundation'),
  ('International Rescue Committee', 'foundation'),
  ('National Endowment for the Arts', 'federal')
ON CONFLICT DO NOTHING;

SELECT id INTO fid_rwjf    FROM public.funders WHERE name = 'Robert Wood Johnson Foundation';
SELECT id INTO fid_casey   FROM public.funders WHERE name = 'Annie E. Casey Foundation';
SELECT id INTO fid_epa     FROM public.funders WHERE name = 'EPA Office of Environmental Justice';
SELECT id INTO fid_usda    FROM public.funders WHERE name = 'USDA Community Food Projects';
SELECT id INTO fid_kellogg FROM public.funders WHERE name = 'W.K. Kellogg Foundation';
SELECT id INTO fid_jpmc    FROM public.funders WHERE name = 'JP Morgan Chase Foundation';
SELECT id INTO fid_enter   FROM public.funders WHERE name = 'Enterprise Community Partners';
SELECT id INTO fid_mozilla FROM public.funders WHERE name = 'Mozilla Foundation';
SELECT id INTO fid_irc     FROM public.funders WHERE name = 'International Rescue Committee';
SELECT id INTO fid_nea     FROM public.funders WHERE name = 'National Endowment for the Arts';

-- Insert opportunities
INSERT INTO public.opportunities (funder_id, title, source, description, award_floor, award_ceiling, deadline, status) VALUES
  (fid_rwjf,    'Community Health Workforce Development Initiative',
   'foundation', 'Supports nonprofits building community health worker programs in underserved areas. Priority given to organizations serving rural and tribal communities.',
   50000, 250000, '2026-09-15', 'open'),
  (fid_casey,   'Youth Mental Health and Resilience Program',
   'foundation', 'Funding for organizations providing evidence-based mental health support to youth ages 10–24, with emphasis on school-based programs and peer support models.',
   25000, 150000, '2026-08-30', 'open'),
  (fid_epa,     'Environmental Justice Community Grants',
   'federal', 'Federal grants for community organizations addressing environmental and public health harms in overburdened communities. Focus on air quality, water access, and toxic exposure.',
   100000, 500000, '2026-10-01', 'open'),
  (fid_usda,    'Food Security and Nutrition Access Initiative',
   'federal', 'Supports community food projects that improve food security for low-income populations. Eligible activities include food banks, community gardens, and nutrition education.',
   10000, 125000, '2026-07-31', 'open'),
  (fid_kellogg, 'Early Childhood Education Capacity Building',
   'foundation', 'Grants to nonprofits expanding access to high-quality early childhood education for children birth to age 5. Priority for BIPOC-led organizations.',
   75000, 300000, '2026-09-01', 'open'),
  (fid_jpmc,    'Workforce Reentry and Economic Mobility Program',
   'corporate', 'Funding for organizations helping formerly incarcerated individuals and opportunity youth access job training, credentials, and placement into living-wage employment.',
   50000, 200000, '2026-08-15', 'open'),
  (fid_enter,   'Affordable Housing Stability Initiative',
   'foundation', 'Supports community organizations working to prevent eviction, expand affordable housing access, and provide wraparound services for housing-insecure families.',
   40000, 175000, '2026-10-15', 'open'),
  (fid_mozilla, 'Digital Equity and Technology Access Program',
   'foundation', 'Grants to close the digital divide by funding device access, broadband connectivity, and digital literacy training for low-income and rural communities.',
   20000, 100000, '2026-08-01', 'open'),
  (fid_irc,     'Immigrant and Refugee Integration Services',
   'foundation', 'Supports organizations providing legal services, language access, employment support, and civic integration programs for newly arrived immigrants and refugees.',
   30000, 150000, '2026-09-30', 'open'),
  (fid_nea,     'Arts and Culture Community Resilience Fund',
   'federal', 'Federal funding for nonprofit arts organizations integrating arts programming into community health, education, and economic development initiatives.',
   10000, 100000, '2026-11-01', 'open');

END $$;
