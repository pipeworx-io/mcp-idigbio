interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * iDigBio biodiversity specimen MCP.
 *
 * Keyless search across ~150M digitized natural-history museum specimen records
 * (plants, animals, fossils) from US collections, via the iDigBio search API
 * (search.idigbio.org/v2). Records are normalized Darwin Core indexTerms.
 */


const BASE = 'https://search.idigbio.org/v2';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

// Maps an inputSchema property name -> the iDigBio rq field name. iDigBio
// indexTerms are lowercased, so filter values are lowercased before querying.
const SEARCH_FILTERS: Record<string, string> = {
  scientific_name: 'scientificname',
  genus: 'genus',
  family: 'family',
  country: 'country',
  state_province: 'stateprovince',
  recorded_by: 'recordedby',
};

const COUNT_FILTERS: Record<string, string> = {
  scientific_name: 'scientificname',
  genus: 'genus',
  family: 'family',
  country: 'country',
};

function buildRq(args: Record<string, unknown>, allowed: Record<string, string>): Record<string, string> {
  const rq: Record<string, string> = {};
  for (const [prop, field] of Object.entries(allowed)) {
    const v = args[prop];
    if (typeof v === 'string' && v.trim()) rq[field] = v.trim().toLowerCase();
  }
  return rq;
}

function mapSpecimen(t: Record<string, unknown>): Record<string, unknown> {
  const geopoint = (t.geopoint as Record<string, unknown> | undefined) ?? undefined;
  return {
    uuid: t.uuid ?? null,
    scientific_name: t.scientificname ?? null,
    common_name: t.commonname ?? null,
    genus: t.genus ?? null,
    family: t.family ?? null,
    order: t.order ?? null,
    class_: t.class ?? null,
    kingdom: t.kingdom ?? null,
    country: t.country ?? null,
    state_province: t.stateprovince ?? null,
    county: t.county ?? null,
    locality: t.locality ?? null,
    latitude: geopoint?.lat ?? null,
    longitude: geopoint?.lon ?? null,
    date_collected: t.datecollected ?? null,
    recorded_by: t.recordedby ?? t.collector ?? null,
    institution: t.institutioncode ?? null,
    collection: t.collectioncode ?? null,
    catalog_number: t.catalognumber ?? null,
    basis_of_record: t.basisofrecord ?? null,
  };
}

const tools: McpToolExport['tools'] = [
  {
    name: 'search_specimens',
    description:
      'Search ~150M digitized natural-history museum specimen records (plants, animals, fossils) from US collections via iDigBio. Filter by any combination of taxonomy and locality. At least one filter is required. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        scientific_name: {
          type: 'string',
          description: 'Scientific name, e.g. "puma concolor", "quercus alba". Matched case-insensitively.',
        },
        genus: { type: 'string', description: 'Genus, e.g. "acer", "quercus", "puma".' },
        family: { type: 'string', description: 'Family, e.g. "felidae", "sapindaceae".' },
        country: { type: 'string', description: 'Country, e.g. "united states", "canada".' },
        state_province: { type: 'string', description: 'State or province, e.g. "florida", "wyoming".' },
        recorded_by: { type: 'string', description: 'Collector / recorded-by name, e.g. "macginitie".' },
        limit: { type: 'number', description: 'Max records to return (default 10, max 25).' },
      },
    },
  },
  {
    name: 'get_specimen',
    description:
      'Get the full normalized record for a single iDigBio specimen by its uuid. e.g. uuid "0746b188-c390-4ab1-bd20-5489a9c6c33c" (a Puma concolor record). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'iDigBio record uuid, e.g. "0746b188-c390-4ab1-bd20-5489a9c6c33c".',
        },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'count_by_field',
    description:
      'Get taxonomic/geographic specimen counts grouped by a field (top values + counts) across iDigBio. Optionally scope the counts with taxonomy/locality filters. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          description:
            'Field to group by: one of country, stateprovince, family, genus, institutioncode, basisofrecord.',
        },
        scientific_name: { type: 'string', description: 'Optional filter to scope the counts.' },
        genus: { type: 'string', description: 'Optional filter to scope the counts.' },
        family: { type: 'string', description: 'Optional filter to scope the counts.' },
        country: { type: 'string', description: 'Optional filter to scope the counts.' },
        top_count: { type: 'number', description: 'Number of top buckets to return (default 10, max 25).' },
      },
      required: ['field'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_specimens':
        return searchSpecimens(args);
      case 'get_specimen':
        return getSpecimen(args);
      case 'count_by_field':
        return countByField(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function searchSpecimens(args: Record<string, unknown>): Promise<unknown> {
  const rq = buildRq(args, SEARCH_FILTERS);
  if (Object.keys(rq).length === 0) {
    return { error: 'provide at least one filter: scientific_name, genus, family, country, state_province, or recorded_by' };
  }
  const limit = clamp(args.limit, 10, 25);

  const url = `${BASE}/search/records/?rq=${encodeURIComponent(JSON.stringify(rq))}&limit=${limit}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) return { error: `iDigBio: ${res.status} ${(await res.text()).slice(0, 200)}` };

  const body = (await res.json()) as { itemCount?: number; items?: Array<Record<string, unknown>> };
  const items = Array.isArray(body.items) ? body.items : [];
  const specimens = items.map((it) => mapSpecimen((it.indexTerms as Record<string, unknown>) ?? {}));
  return { total: body.itemCount ?? specimens.length, count: specimens.length, specimens };
}

async function getSpecimen(args: Record<string, unknown>): Promise<unknown> {
  const uuid = typeof args.uuid === 'string' ? args.uuid.trim() : '';
  if (!uuid) return { error: 'provide a uuid' };

  const res = await fetch(`${BASE}/view/records/${encodeURIComponent(uuid)}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (res.status === 404) return { error: 'specimen not found', uuid };
  if (!res.ok) return { error: `iDigBio: ${res.status} ${(await res.text()).slice(0, 200)}` };

  const body = (await res.json()) as { indexTerms?: Record<string, unknown> };
  const t = body.indexTerms ?? {};
  return { ...mapSpecimen(t), taxon_rank: t.taxonrank ?? null, phylum: t.phylum ?? null };
}

async function countByField(args: Record<string, unknown>): Promise<unknown> {
  const field = typeof args.field === 'string' ? args.field.trim().toLowerCase() : '';
  if (!field) return { error: 'provide a field to group by' };
  const top = clamp(args.top_count, 10, 25);
  const rq = buildRq(args, COUNT_FILTERS);

  const rqParam = `rq=${encodeURIComponent(JSON.stringify(rq))}`;
  const url = `${BASE}/summary/top/records/?${rqParam}&top_fields=${encodeURIComponent(field)}&count=${top}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) return { error: `iDigBio: ${res.status} ${(await res.text()).slice(0, 200)}` };

  // Shape: { "<field>": { "<value>": { "itemCount": N }, ... }, "itemCount": total }
  const body = (await res.json()) as Record<string, unknown>;
  const grouped = (body[field] as Record<string, { itemCount?: number }> | undefined) ?? {};
  const buckets = Object.entries(grouped).map(([value, v]) => ({
    value,
    count: (v && typeof v === 'object' ? v.itemCount : undefined) ?? null,
  }));
  return { field, count: buckets.length, buckets };
}

function clamp(v: unknown, def: number, max: number): number {
  const n = typeof v === 'number' ? Math.floor(v) : def;
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, max);
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
