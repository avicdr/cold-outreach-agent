import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export function cleanCompanyName(raw) {
  if (!raw) return 'Practice';
  let name = raw.trim();

  // If format is 'Dr. Ben Talei - Beverly Hills Center for Plastic Surgery', take the practice name
  const drMatch = name.match(/^Dr\.\s+[A-Za-z\s]+[-–—]\s*(.+)$/i);
  if (drMatch && drMatch[1]) {
    name = drMatch[1].trim();
  }

  // Remove trailing legal suffixes
  name = name.replace(/(?:,\s*|\s+)(LLC|Inc\.?|PLLC|P\.C\.|PC|P\.A\.|PA|Ltd\.?)$/gi, '').trim();
  
  // Specific known multi-hyphens like Oasis Dental
  name = name.replace(/^Oasis Dental\s*[-–—].*$/i, 'Oasis Dental');

  // Remove ' - Doctor Name' or ' - Location/Branch'
  name = name.replace(/\s*[-–—]\s*(Dr\.?|Alex Reizian|Katy|El Cajon Blvd|Alex Reizian DMD|North Fulton|Scottsdale|Charlotte|South|Central|West|East|Downtown|Austin|Bellevue|Houston|Naperville|Aurora|Dallas|Beverly|South Loop|The Loop|Eastover|SouthPark|South End|South Tampa|Colorado Blvd|North Valley|Jefferson|Warm Springs|North Raleigh|Park Cities|Oak Cliff).*$/i, '');
  name = name.replace(/\s*[-–—]\s*(Dr\.\s+[A-Za-z]+|[A-Za-z]+,\s*(M\.D\.|DMD|DDS|DC)).*$/i, '');
  name = name.replace(/:\s*Dr\.\s+.*$/i, '');
  name = name.replace(/:\s*[A-Za-z\s]+,\s*(DC|DMD|DDS|MD).*$/i, '');
  
  // Remove ' of North Fulton'
  name = name.replace(/\s+of\s+North\s+Fulton$/i, '');
  // Strip trailing state abbrev if preceded by city name, e.g., ' WA'
  name = name.replace(/\s+WA$/i, '');
  
  // Clean trailing punctuation
  name = name.replace(/[,;:-]+$/, '').trim();
  name = name.replace(/\s{2,}/g, ' ');
  return name;
}

export function getSubjectCompanyName(comp) {
  const words = comp.split(/\s+/);
  if (words.length <= 4) return comp;
  let sliced = words.slice(0, 3);
  if (['&', 'and', 'for', 'of', 'at', 'the', 'in', 'to', 'dog', 'er'].includes(sliced[sliced.length - 1].toLowerCase())) {
    sliced = words.slice(0, 4);
  }
  let res = sliced.join(' ').replace(/[,;&/:-]+$/, '').trim();
  return res;
}

export function cleanCityName(raw) {
  if (!raw) return 'your area';
  const first = raw.split(/[,/]/)[0].trim();
  return first;
}

export function getCategoryConfig(category) {
  const cat = (category || '').toLowerCase();
  
  if (cat.includes('auto repair') || cat.includes('detailing') || cat.includes('tire')) {
    return {
      categoryPhrase: 'auto repair shops',
      practiceType: 'shop',
      entityPlural: 'repair shops',
      callerNoun: 'customer',
      callerPlural: 'customers'
    };
  }
  if (cat.includes('veterin')) {
    return {
      categoryPhrase: 'veterinary clinics',
      practiceType: 'clinic',
      entityPlural: 'veterinary clinics',
      callerNoun: 'pet owner',
      callerPlural: 'pet owners'
    };
  }
  if (cat.includes('dent') || cat.includes('orthodont')) {
    return {
      categoryPhrase: 'dental practices',
      practiceType: 'practice',
      entityPlural: 'dental practices',
      callerNoun: 'patient',
      callerPlural: 'patients'
    };
  }
  if (cat.includes('chiro')) {
    return {
      categoryPhrase: 'chiropractic clinics',
      practiceType: 'practice',
      entityPlural: 'clinics',
      callerNoun: 'patient',
      callerPlural: 'patients'
    };
  }
  if (cat.includes('physical therapy') || cat.includes('pt') || cat.includes('rehab')) {
    return {
      categoryPhrase: 'physical therapy and rehab clinics',
      practiceType: 'clinic',
      entityPlural: 'clinics',
      callerNoun: 'patient',
      callerPlural: 'patients'
    };
  }
  if (cat.includes('podiatry')) {
    return {
      categoryPhrase: 'podiatry practices',
      practiceType: 'practice',
      entityPlural: 'practices',
      callerNoun: 'patient',
      callerPlural: 'patients'
    };
  }
  if (cat.includes('optometry') || cat.includes('ophthalm')) {
    return {
      categoryPhrase: 'eye care practices',
      practiceType: 'practice',
      entityPlural: 'eye care clinics',
      callerNoun: 'patient',
      callerPlural: 'patients'
    };
  }
  if (cat.includes('spa') || cat.includes('dermatology') || cat.includes('plastic surgery')) {
    return {
      categoryPhrase: 'aesthetic and wellness practices',
      practiceType: 'practice',
      entityPlural: 'practices',
      callerNoun: 'client',
      callerPlural: 'clients'
    };
  }
  return {
    categoryPhrase: 'local practices',
    practiceType: 'practice',
    entityPlural: 'practices',
    callerNoun: 'patient',
    callerPlural: 'patients'
  };
}

export function countWords(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

export function generateDraft(lead, index) {
  const comp = cleanCompanyName(lead.company);
  const subjComp = getSubjectCompanyName(comp);
  const city = cleanCityName(lead.city);
  const cfg = getCategoryConfig(lead.category);
  const rating = lead.rating ? Number(lead.rating).toFixed(1) : '5.0';
  const reviews = lead.review_count || 100;

  // Varied natural subjects (strictly 3 to 7 words, NO long hyphens)
  const subjects = [
    `After-hours calls at ${subjComp}`,
    `A quick idea for ${subjComp}`,
    `After-hours inquiries at ${subjComp}`,
    `A quick idea for your ${cfg.practiceType}`
  ];
  let subject = subjects[index % subjects.length];
  // Ensure subject is strictly within 3-7 words
  let sWords = countWords(subject);
  if (sWords > 7) {
    subject = `After-hours calls for your ${cfg.practiceType}`;
  }

  const openings = [
    `I came across your ${cfg.practiceType} while researching ${cfg.categoryPhrase} in ${city}. With ${reviews} Google reviews and a ${rating}-star rating, you've built a strong reputation.`,
    `I was researching ${cfg.categoryPhrase} in ${city} and came across ${comp}. With a ${rating}-star rating across ${reviews} Google reviews, you've built an impressive reputation.`,
    `I came across ${comp} while looking into ${cfg.categoryPhrase} in ${city}. Seeing your ${rating}-star rating across ${reviews} Google reviews, it's clear you have great local trust.`
  ];
  const opening = openings[index % openings.length];

  const bodies = [
    `I'm reaching out from Arenova. We help ${cfg.entityPlural} capture missed opportunities with AI receptionists that answer inbound calls 24/7, handle ${cfg.callerNoun} inquiries, book appointments, and follow up automatically.`,
    `I'm reaching out from Arenova. We help ${cfg.entityPlural} stay responsive around the clock with AI receptionists that handle inbound calls, answer common questions, schedule appointments, and follow up automatically.`,
    `I'm reaching out from Arenova. We build AI receptionists for ${cfg.entityPlural} to answer inbound calls 24/7, answer ${cfg.callerNoun} questions, book appointments directly, and handle routine follow-ups.`
  ];
  const body = bodies[index % bodies.length];

  const framings = [
    `The idea is simple: capture inquiries that might otherwise go unanswered when your team is busy or the office is closed, without adding staffing costs.`,
    `The premise is simple: ensure prospective ${cfg.callerPlural} get immediate assistance when your lines are busy or doors are closed, without adding overhead.`,
    `The goal is simple: ensure every caller gets immediate help, especially after hours or when your staff is busy, without adding payroll.`
  ];
  const framing = framings[index % framings.length];

  const ctas = [
    `Would you be open to a quick 10-minute demo to see if this could work for your ${cfg.practiceType}?`,
    `Would you be open to a quick demo to see if this could work for your ${cfg.practiceType}?`,
    `Would it be useful if I sent over a short preview?`,
    `Worth a quick look to see if this could help your ${cfg.practiceType}?`
  ];
  const cta = ctas[index % ctas.length];

  const greeting = `Hi ${comp} Team,`;
  const signature = `Best,\nAvi\nArenova`;

  const bodyText = `${greeting}\n\n${opening}\n\n${body}\n\n${framing}\n\n${cta}\n\n${signature}`;
  
  // Word count excluding signature
  const bodyWithoutSig = `${greeting} ${opening} ${body} ${framing} ${cta}`;
  const wordCount = countWords(bodyWithoutSig);
  const subjectWordCount = countWords(subject);

  // Check for long hyphens (em-dash U+2014 or en-dash U+2013)
  const hasLongHyphen = /[—–]/.test(bodyText) || /[—–]/.test(subject);

  return {
    subject,
    subjectWordCount,
    bodyText,
    wordCount,
    hasLongHyphen,
    personalizationBasis: [
      `${comp} in ${city}`,
      `${reviews} Google reviews at ${rating} stars`,
      `${cfg.categoryPhrase} category focus`
    ]
  };
}
