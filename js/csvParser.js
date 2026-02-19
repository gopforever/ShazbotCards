/**
 * csvParser.js — eBay Traffic Report CSV parsing utilities
 * Handles eBay's quirky CSV format: disclaimer rows, ="..." item IDs,
 * percentage strings, and comma-formatted numbers inside quoted strings.
 */

const CSVParser = (() => {

  /**
   * Parse a single CSV line respecting quoted fields (may contain commas).
   */
  function parseLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  /**
   * Clean a raw field value:
   *  - Strip eBay's ="..." item ID wrapper → plain numeric string
   *  - Strip % suffix and parse as float
   *  - Strip commas from numbers (e.g. "1,150.0%" → 1150.0)
   *  - Return "-" as null (means no data / N/A)
   */
  function cleanValue(raw) {
    if (raw === undefined || raw === null) return null;
    const s = raw.trim();
    if (s === '' || s === '-') return null;

    // eBay item ID format: ="358228910357" (raw) or =358228910357 (after CSV quote-stripping)
    const ebayIdMatch = s.match(/^="(.*)"$/) || s.match(/^=(\d+)$/);
    if (ebayIdMatch) return ebayIdMatch[1];

    return s;
  }

  /**
   * Parse a percentage string like "0.0%" or "1,150.0%" into a float.
   * Returns null for "-" or empty.
   */
  function parsePercent(raw) {
    const s = (raw || '').trim();
    if (s === '' || s === '-') return null;
    // Remove commas (e.g. "1,150.0%") then strip "%"
    const num = parseFloat(s.replace(/,/g, '').replace(/%/g, ''));
    return isNaN(num) ? null : num;
  }

  /**
   * Parse an integer field, removing commas.
   */
  function parseInteger(raw) {
    const s = (raw || '').trim();
    if (s === '' || s === '-') return null;
    const num = parseInt(s.replace(/,/g, ''), 10);
    return isNaN(num) ? null : num;
  }

  /**
   * Main entry point. Takes raw CSV text and returns an array of listing
   * objects with typed fields.
   *
   * eBay's report has:
   *   Row 0: "Disclaimers"
   *   Row 1: "• This report includes …"
   *   Row 2: (blank)
   *   Row 3: "Report for …" (quoted, treated as one big field)
   *   Row 4: Column headers
   *   Row 5+: Data rows
   */
  function parse(csvText) {
    const rawLines = csvText.split(/\r?\n/);

    // Find the header row (contains "Listing title")
    let headerIdx = -1;
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i].startsWith('Listing title')) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      throw new Error('Could not find header row in CSV. Expected a row starting with "Listing title".');
    }

    const headers = parseLine(rawLines[headerIdx]).map(h => h.trim());

    const listings = [];
    for (let i = headerIdx + 1; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;

      const fields = parseLine(line);
      if (fields.length < 5) continue; // skip malformed/short rows

      const raw = {};
      headers.forEach((h, idx) => {
        raw[h] = cleanValue(fields[idx]);
      });

      // Skip rows that don't look like listings (e.g. trailing disclaimer rows)
      if (!raw['Listing title']) continue;

      listings.push(buildListing(raw));
    }

    return listings;
  }

  /**
   * Map raw field map to a structured listing object.
   * Column names match the eBay Traffic Report header exactly.
   */
  function buildListing(raw) {
    return {
      title: raw['Listing title'] || '',
      itemId: raw['eBay item ID'] || '',
      startDate: raw['Item Start Date'] || '',
      category: raw['Category'] || '',
      promotedStatus: raw['Current promoted listings status'] || '',
      isPromoted: (raw['Current promoted listings status'] || '').toLowerCase() === 'promoted',
      quantityAvailable: parseInteger(raw['Quantity available']),

      totalImpressions: parseInteger(raw['Total impressions']),
      ctr: parsePercent(raw['Click-through rate = Page views from eBay site/Total impressions']),
      quantitySold: parseInteger(raw['Quantity sold']),
      top20Pct: parsePercent(raw['% Top 20 Search Impressions']),
      conversionRate: parsePercent(raw['Sales conversion rate = Quantity sold/Total page views']),

      top20PromotedImpressions: parseInteger(raw['Top 20 search slot impressions from promoted listings']),
      top20PromotedChangePct: parsePercent(raw['% change in top 20 search slot impressions from promoted listings']),
      top20OrganicImpressions: parseInteger(raw['Top 20 search slot organic impressions']),
      top20OrganicChangePct: parsePercent(raw['% change in top 20 search slot impressions']),
      restSearchImpressions: parseInteger(raw['Rest of search slot impressions']),
      totalSearchImpressions: parseInteger(raw['Total Search Impressions']),

      nonSearchPromotedImpressions: parseInteger(raw['Non-search promoted listings impressions']),
      nonSearchPromotedChangePct: parsePercent(raw['% Change in non-search promoted listings impressions']),
      nonSearchOrganicImpressions: parseInteger(raw['Non-search organic impressions']),
      nonSearchOrganicChangePct: parsePercent(raw['% Change in non-search organic impressions']),

      totalPromotedImpressions: parseInteger(raw['Total Promoted Listings impressions (applies to eBay site only)']),
      totalOffsiteImpressions: parseInteger(raw['Total Promoted Offsite impressions (applies to off-eBay only)']),
      totalOrganicImpressions: parseInteger(raw['Total organic impressions on eBay site']),

      totalPageViews: parseInteger(raw['Total page views']),
      pageViewsPromoted: parseInteger(raw['Page views via promoted listings impressions on eBay site']),
      pageViewsPromotedOffsite: parseInteger(raw['Page views via promoted listings Impressions from outside eBay (search engines, affilliates)']),
      pageViewsOrganic: parseInteger(raw['Page views via organic impressions on eBay site']),
      pageViewsOrganicOffsite: parseInteger(raw['Page views from organic impressions outside eBay (Includes page views from search engines)']),
    };
  }

  return { parse };
})();
