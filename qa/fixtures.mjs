// Seed data for the QA harness: one fake account per kind of user the app
// branches on. All names, EINs and numbers are made up.
const iso = (days) => new Date(Date.now() + days * 864e5).toISOString();
const day = (days) => iso(days).slice(0, 10);
const mkUser = (id, email, org) => ({ id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: iso(-30), user_metadata: { org_name: org }, app_metadata: { provider: 'email' }, created_at: iso(-30) });

const FULL_ANSWERS = {
  org_name: 'Eastside Youth Collective', entity_type: '501(c)(3) nonprofit', ein: '47-1234567', status_501c3: 'Yes', state_incorp: 'California', year_founded: '2011',
  mission: 'We give low-income youth in East Los Angeles free after-school STEM, tutoring and mentorship so they finish high school ready for college or a career.',
  focus_areas: ['Education', 'Youth'], primary_programs: ['After-school programs', 'Tutoring & mentorship', 'STEM education'],
  beneficiaries: 'Low-income youth ages 8–18 in East Los Angeles.', geo_focus: 'Local', primary_location: 'Los Angeles, CA', people_served: '340',
  annual_budget: '$500K–$1M', staff_count: '6', grant_writer: 'No', applied_before: 'Yes', largest_grant: '$25K–$100K', funding_types: ['Foundation', 'Federal'], biggest_challenge: 'Finding grants we qualify for',
};

export const PERSONAS = {
  visitor: { user: null },
  newuser: { user: mkUser('00000000-0000-4000-8000-000000000001', 'new@example.org', null) },
  np: { user: mkUser('00000000-0000-4000-8000-000000000002', 'director@eastsideyouth.example.org', 'Eastside Youth Collective'), tutorialDone: true },
  legacy: { user: mkUser('00000000-0000-4000-8000-000000000003', 'legacy@example.org', 'Harbor Food Share'), tutorialDone: true },
  biz: { user: mkUser('00000000-0000-4000-8000-000000000004', 'owner@greenleaf.example.com', 'Greenleaf Bakery LLC'), tutorialDone: true },
  onboarding: { user: mkUser('00000000-0000-4000-8000-000000000005', 'half@example.org', 'Riverbend Arts'), tutorialDone: true },
};

const ans = (uid, map) => Object.entries(map).map(([question_key, answer]) => ({ id: 'a-' + uid.slice(-1) + '-' + question_key, user_id: uid, question_key, answer, created_at: iso(-20), updated_at: iso(-20) }));
const profile = (uid, o) => ({ id: 'p-' + uid.slice(-4), user_id: uid, org_name: null, ein: null, mission: null, onboarding_complete: false, tutorial_complete: false, tax_exempt_status: 'unknown', annual_budget: null, staff_count: null, website: null, city: null, state: null, focus_areas: [], service_geographies: [], populations_served: [], weekly_digest: true, created_at: iso(-30), updated_at: iso(-2), ...o });

export function buildDb(persona) {
  const db = { profiles: [], onboarding_answers: [], grants: [], deadlines: [], readiness_items: [], documents: [], draft_outcomes: [], reminders: [], registrations: [], awards: [], compliance_requirements: [], expenditures: [], proposals: [], budget_categories: [
    { key: 'personnel', label: 'Personnel', sort_order: 1 }, { key: 'supplies', label: 'Supplies', sort_order: 2 }, { key: 'travel', label: 'Travel', sort_order: 3 }, { key: 'other', label: 'Other', sort_order: 4 }] };
  const P = PERSONAS[persona]; if (!P || !P.user) return db;
  const uid = P.user.id;
  if (persona === 'newuser') return db;
  if (persona === 'np') {
    db.profiles.push(profile(uid, { org_name: 'Eastside Youth Collective', ein: '47-1234567', mission: FULL_ANSWERS.mission, onboarding_complete: true, tutorial_complete: true, tax_exempt_status: '501c3', annual_budget: 750000, staff_count: 6, city: 'Los Angeles', state: 'CA', website: 'https://eastsideyouth.example.org' }));
    db.onboarding_answers.push(...ans(uid, FULL_ANSWERS));
    const g = (id, title, funder, amount, dl, status) => ({ id, user_id: uid, title, funder, amount, deadline: dl, status, archived: false, created_at: iso(-10) });
    db.grants.push(
      g('g1', 'Youth STEM Pathways Fund', 'Ahmanson Foundation', 25000, day(18), 'drafting'),
      g('g2', '21st Century Community Learning Centers', 'Department of Education', 150000, day(45), 'saved'),
      g('g3', 'Community Impact Grant', 'Weingart Foundation', 50000, day(-12), 'submitted'),
      g('g4', 'After-School Literacy Award', 'California Endowment', 30000, day(-60), 'awarded'),
    );
    db.deadlines.push(
      { id: 'd1', user_id: uid, grant_id: 'g1', kind: 'proposal', title: 'Youth STEM Pathways Fund: proposal due', due_date: day(18), status: 'upcoming', created_at: iso(-10) },
      { id: 'd2', user_id: uid, grant_id: 'g2', kind: 'proposal', title: '21st CCLC: proposal due', due_date: day(45), status: 'upcoming', created_at: iso(-9) },
      { id: 'd3', user_id: uid, grant_id: null, kind: 'registration_renewal', title: 'Renew SAM.gov registration', due_date: day(4), status: 'upcoming', created_at: iso(-9) },
      { id: 'd4', user_id: uid, grant_id: 'g3', kind: 'report', title: 'Weingart interim report', due_date: day(-3), status: 'done', completed_at: iso(-3), created_at: iso(-30) },
    );
    db.readiness_items.push({ id: 'r1', user_id: uid, req_key: 'determination_letter', status: 'have' }, { id: 'r2', user_id: uid, req_key: 'form_990', status: 'in_progress' });
    db.awards.push({ id: 'aw1', user_id: uid, grant_id: 'g4', amount_awarded: 30000, period_start: day(-60), period_end: day(305), created_at: iso(-60) });
    db.compliance_requirements.push({ id: 'c1', award_id: 'aw1', label: 'Mid-year progress report', detail: 'Two pages, outcomes to date', status: 'pending', created_at: iso(-55) });
    db.expenditures.push({ id: 'e1', user_id: uid, award_id: 'aw1', category_key: 'personnel', description: 'Tutor stipends (Sept)', amount: 4200, spent_on: day(-20) });
    db.draft_outcomes.push({ id: 'o1', user_id: uid, draft_uid: 'du1', grant_id: 'g3', program: 'After-school STEM', funder_name: 'Weingart Foundation', funder_type: 'Foundation', status: 'submitted', share_consent: false, created_at: iso(-12), updated_at: iso(-12) });
  }
  if (persona === 'legacy') {
    db.profiles.push(profile(uid, { org_name: 'Harbor Food Share', ein: '93-7654321', onboarding_complete: true, tutorial_complete: true, tax_exempt_status: 'unknown' }));
    db.onboarding_answers.push(...ans(uid, { org_name: 'Harbor Food Share', mission: 'We rescue surplus food from grocers and deliver it to families in San Pedro.', focus_areas: ['Food Security'], ein: '93-7654321', status_501c3: 'Yes' }));
  }
  if (persona === 'biz') {
    db.profiles.push(profile(uid, { org_name: 'Greenleaf Bakery LLC', onboarding_complete: true, tutorial_complete: true, tax_exempt_status: 'other' }));
    db.onboarding_answers.push(...ans(uid, { org_name: 'Greenleaf Bakery LLC', entity_type: 'Not a nonprofit', mission: 'A neighborhood bakery that trains and employs young adults leaving foster care.', focus_areas: ['Workforce', 'Food Security'], primary_location: 'Oakland, CA', geo_focus: 'Local', annual_budget: '<$100K' }));
  }
  if (persona === 'onboarding') {
    db.profiles.push(profile(uid, { org_name: 'Riverbend Arts', onboarding_complete: false, tutorial_complete: true }));
    db.onboarding_answers.push(...ans(uid, { org_name: 'Riverbend Arts', entity_type: 'Becoming a nonprofit' }));
  }
  return db;
}
