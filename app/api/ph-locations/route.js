import fs from "node:fs/promises";
import path from "node:path";
import usePostalPH from "use-postal-ph";

export const runtime = "nodejs";

let cachedDataset = null;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bcity of\b/g, "")
    .replace(/\bcity\b/g, "")
    .replace(/\bprovince of\b/g, "")
    .replace(/\bprovince\b/g, "")
    .replace(/\bsta\.?\b/g, "santa")
    .replace(/\bsto\.?\b/g, "santo")
    .replace(/\bmt\.?\b/g, "mount")
    .replace(/\bgen\.?\b/g, "general")
    .replace(/\s+/g, " ")
    .replace(/[.'()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toPostalCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length ? digits.padStart(4, "0").slice(0, 4) : "";
}

function firstDefined(...values) {
  for (const value of values) {
    if (value) {
      return value;
    }
  }
  return "";
}

function buildVariantNames(rawName) {
  const normalized = normalizeName(rawName);
  const variants = new Set([normalized]);
  variants.add(normalized.replace(/\bsaint\b/g, "santo").trim());
  variants.add(normalized.replace(/\bsanto\b/g, "sto").trim());
  variants.add(normalized.replace(/\bsanta\b/g, "sta").trim());
  variants.add(normalized.replace(/\bprovince\b/g, "").trim());
  return [...variants].filter(Boolean);
}

function buildProvinceZipMap(postalRows) {
  const zipByProvinceMunicipality = new Map();
  const municipalityZipSets = new Map();

  for (const row of postalRows) {
    const province = normalizeName(row.location);
    const municipality = normalizeName(row.municipality);
    const zip = toPostalCode(row.post_code);
    if (!province || !municipality || !zip) {
      continue;
    }

    const key = `${province}::${municipality}`;
    if (!zipByProvinceMunicipality.has(key)) {
      zipByProvinceMunicipality.set(key, zip);
    }

    if (!municipalityZipSets.has(municipality)) {
      municipalityZipSets.set(municipality, new Set());
    }
    municipalityZipSets.get(municipality).add(zip);
  }

  const uniqueZipByMunicipality = new Map();
  for (const [municipality, zipSet] of municipalityZipSets.entries()) {
    if (zipSet.size === 1) {
      uniqueZipByMunicipality.set(municipality, [...zipSet][0]);
    }
  }

  return { zipByProvinceMunicipality, uniqueZipByMunicipality };
}

function resolveZipCode({
  provinceName,
  municipalityName,
  zipByProvinceMunicipality,
  uniqueZipByMunicipality
}) {
  const provinceVariants = buildVariantNames(provinceName);
  const municipalityVariants = buildVariantNames(municipalityName);

  for (const province of provinceVariants) {
    for (const municipality of municipalityVariants) {
      const key = `${province}::${municipality}`;
      const matched = zipByProvinceMunicipality.get(key);
      if (matched) {
        return matched;
      }
    }
  }

  for (const municipality of municipalityVariants) {
    const unique = uniqueZipByMunicipality.get(municipality);
    if (unique) {
      return unique;
    }
  }

  return "";
}

async function resolvePsgcDataDir() {
  const baseDir = path.join(process.cwd(), "node_modules", "@jobuntux", "psgc", "data");
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (!versions.length) {
    throw new Error("PSGC data directory is missing.");
  }

  return path.join(baseDir, versions[versions.length - 1]);
}

async function readPsgcJson(dataDir, filename) {
  const raw = await fs.readFile(path.join(dataDir, filename), "utf8");
  return JSON.parse(raw);
}

async function loadDataset() {
  if (cachedDataset) {
    return cachedDataset;
  }

  const dataDir = await resolvePsgcDataDir();
  const [provinces, muncities, barangays] = await Promise.all([
    readPsgcJson(dataDir, "provinces.json"),
    readPsgcJson(dataDir, "muncities.json"),
    readPsgcJson(dataDir, "barangays.json")
  ]);

  const postal = usePostalPH();
  const postalRows = postal.fetchDataLists({}).data || [];
  const { zipByProvinceMunicipality, uniqueZipByMunicipality } = buildProvinceZipMap(postalRows);

  const provinceOptions = provinces
    .map((province) => ({
      code: String(province.provCode || "").trim(),
      name: cleanLabel(province.provName)
    }))
    .filter((province) => province.code && province.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  const provinceByCode = new Map(provinceOptions.map((province) => [province.code, province]));
  const munCityByCode = new Map(
    muncities.map((item) => [
      String(item.munCityCode || "").trim(),
      {
        code: String(item.munCityCode || "").trim(),
        name: cleanLabel(item.munCityName),
        provCode: String(item.provCode || "").trim()
      }
    ])
  );

  const municipalitiesByProvinceCode = new Map();
  for (const municipality of munCityByCode.values()) {
    if (!municipality.provCode || !municipality.code || !municipality.name) {
      continue;
    }
    if (!municipalitiesByProvinceCode.has(municipality.provCode)) {
      municipalitiesByProvinceCode.set(municipality.provCode, []);
    }
    municipalitiesByProvinceCode.get(municipality.provCode).push({
      code: municipality.code,
      name: municipality.name
    });
  }

  for (const [provCode, items] of municipalitiesByProvinceCode.entries()) {
    items.sort((a, b) => a.name.localeCompare(b.name));
    municipalitiesByProvinceCode.set(provCode, items);
  }

  const barangaysByProvinceCode = new Map();
  for (const barangay of barangays) {
    const provCode = String(barangay.provCode || "").trim();
    const munCityCode = String(barangay.munCityCode || "").trim();
    const barangayCode = String(barangay.brgyCode || "").trim();
    const barangayName = cleanLabel(barangay.brgyName);
    if (!provCode || !munCityCode || !barangayCode || !barangayName) {
      continue;
    }

    const province = provinceByCode.get(provCode);
    const municipality = munCityByCode.get(munCityCode);
    if (!province || !municipality) {
      continue;
    }

    const zipCode = resolveZipCode({
      provinceName: province.name,
      municipalityName: municipality.name,
      zipByProvinceMunicipality,
      uniqueZipByMunicipality
    });

    if (!barangaysByProvinceCode.has(provCode)) {
      barangaysByProvinceCode.set(provCode, []);
    }

    barangaysByProvinceCode.get(provCode).push({
      code: barangayCode,
      mun_city_code: municipality.code,
      name: barangayName,
      city_municipality: municipality.name,
      zip_code: zipCode
    });
  }

  for (const [provCode, items] of barangaysByProvinceCode.entries()) {
    items.sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return a.city_municipality.localeCompare(b.city_municipality);
    });
    barangaysByProvinceCode.set(provCode, items);
  }

  cachedDataset = { provinceOptions, municipalitiesByProvinceCode, barangaysByProvinceCode };
  return cachedDataset;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const provinceCode = String(url.searchParams.get("provinceCode") || "").trim();
    const dataset = await loadDataset();

    if (!provinceCode) {
      return Response.json({
        ok: true,
        provinces: dataset.provinceOptions
      });
    }

    return Response.json({
      ok: true,
      province_code: provinceCode,
      municipalities: dataset.municipalitiesByProvinceCode.get(provinceCode) || [],
      barangays: dataset.barangaysByProvinceCode.get(provinceCode) || []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Philippine location data.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
