// Seasons for the island. Pure; shared by server, client and tests.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter', 'dry', 'wet'] as const;
export type Season = (typeof SEASONS)[number];
export type SeasonChoice = Season | 'auto';

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', dry: 'Dry season', wet: 'Wet season',
};

export interface Climate {
  kind: 'north' | 'south' | 'tropical';
  /** Months (1–12) of the wet season, for tropical climates. */
  wet: number[];
  region: string;
}

const range = (from: number, to: number) => {
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) { out.push(m); if (m === to) break; }
  return out;
};

// Rough wet-season months by region, keyed by IANA timezone. Users can override with PALACE_CLIMATE / PALACE_WET_MONTHS.
const TROPICAL: [RegExp, number[], string][] = [
  [/^Asia\/(Jakarta|Pontianak|Makassar|Jayapura|Dili)$/, range(11, 3), 'Maritime Southeast Asia'],
  [/^Asia\/(Bangkok|Ho_Chi_Minh|Saigon|Phnom_Penh|Vientiane|Yangon|Rangoon)$/, range(5, 10), 'Mainland Southeast Asia'],
  [/^Asia\/Manila$/, range(6, 11), 'Philippines'],
  [/^Asia\/(Kuala_Lumpur|Kuching|Singapore|Brunei)$/, range(11, 1), 'Malay Peninsula'],
  [/^Asia\/(Kolkata|Calcutta|Colombo|Dhaka|Kathmandu|Karachi|Thimphu)$/, range(6, 9), 'South Asia'],
  [/^Africa\/(Lagos|Accra|Abidjan|Dakar|Bamako|Ouagadougou|Niamey|Conakry|Freetown|Monrovia|Lome|Porto-Novo|Douala|Bangui|Ndjamena|Banjul|Bissau)$/, range(5, 10), 'West Africa'],
  [/^Africa\/(Nairobi|Kampala|Dar_es_Salaam|Addis_Ababa|Mogadishu|Kigali|Bujumbura|Djibouti|Asmara)$/, [3, 4, 5, 10, 11, 12], 'East Africa'],
  [/^Africa\/(Harare|Lusaka|Maputo|Blantyre|Lilongwe|Luanda|Lubumbashi|Kinshasa|Windhoek)$/, range(11, 3), 'Southern tropical Africa'],
  [/^America\/(Bogota|Caracas|Panama|Costa_Rica|Managua|Tegucigalpa|El_Salvador|Guatemala|Belize|Mexico_City|Merida|Cancun|Guayaquil|Port-au-Prince|Santo_Domingo|Jamaica|Havana|Puerto_Rico)$/, range(5, 10), 'Central America & Caribbean'],
  [/^America\/(Sao_Paulo|Manaus|Belem|Fortaleza|Recife|Bahia|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|La_Paz|Lima)$/, range(10, 3), 'Tropical South America'],
  [/^Australia\/Darwin$/, range(11, 4), 'Northern Australia'],
  [/^Pacific\/(Fiji|Port_Moresby|Guadalcanal|Noumea|Efate|Tahiti|Apia|Tongatapu|Guam|Saipan|Palau|Majuro|Honolulu)$/, range(11, 4), 'Tropical Pacific'],
  [/^Indian\/(Maldives|Mauritius|Reunion|Mahe|Antananarivo|Comoro|Mayotte)$/, range(11, 4), 'Indian Ocean'],
];
const SOUTH = /^(Australia\/|Pacific\/(Auckland|Chatham)|America\/(Argentina|Santiago|Montevideo|Asuncion|Punta_Arenas)|Africa\/(Johannesburg|Maseru|Mbabane|Gaborone)|Atlantic\/(Stanley|South_Georgia)|Antarctica\/)/;

export function climateFor(timeZone: string, override?: { kind?: string; wetMonths?: number[] }): Climate {
  const kind = override?.kind;
  if (kind === 'north' || kind === 'south') return { kind, wet: [], region: 'Set in settings' };
  const tropical = TROPICAL.find(([re]) => re.test(timeZone));
  if (kind === 'tropical' || tropical) {
    return {
      kind: 'tropical',
      wet: override?.wetMonths?.length ? override.wetMonths : tropical ? tropical[1] : range(11, 3),
      region: override?.wetMonths?.length ? 'Set in settings' : tropical ? tropical[2] : 'Tropical',
    };
  }
  return { kind: SOUTH.test(timeZone) ? 'south' : 'north', wet: [], region: SOUTH.test(timeZone) ? 'Southern hemisphere' : 'Northern hemisphere' };
}

export function seasonFor(c: Climate, month: number): Season {
  if (c.kind === 'tropical') return c.wet.includes(month) ? 'wet' : 'dry';
  const m = c.kind === 'south' ? ((month + 5) % 12) + 1 : month;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wet season · Nov–Mar" style label for the Auto option. */
export function describeAuto(c: Climate, month: number): string {
  const s = seasonFor(c, month);
  if (c.kind !== 'tropical' || !c.wet.length) return SEASON_LABEL[s];
  // Find the first month of the wet run (a wet month whose previous month is dry).
  const first = c.wet.find((m) => !c.wet.includes(((m + 10) % 12) + 1)) ?? c.wet[0];
  const last = c.wet.find((m) => !c.wet.includes((m % 12) + 1)) ?? c.wet[c.wet.length - 1];
  return `${SEASON_LABEL[s]} · wet ${MONTH[first - 1]}–${MONTH[last - 1]}`;
}
