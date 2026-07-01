import { STEAM_API_KEY } from '../config';

export interface WorkshopMod {
  publishedFileId: string;
  title: string;
  description: string;
  previewUrl?: string;
  author?: string;
}

export async function searchWorkshop(query: string, page = 1): Promise<WorkshopMod[]> {
  if (!STEAM_API_KEY) {
    throw new Error('STEAM_API_KEY is not configured');
  }
  const rows = 20;
  const url = new URL('https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/');
  url.searchParams.set('key', STEAM_API_KEY);
  url.searchParams.set('appid', '1281930');
  url.searchParams.set('search_text', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('numperpage', String(rows));
  url.searchParams.set('return_details', '1');
  url.searchParams.set('query_type', '0');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Steam API error: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const files = json?.response?.publishedfiledetails || [];
  if (!Array.isArray(files) || files.length === 0) return [];

  return files.map((f: any) => ({
    publishedFileId: String(f.publishedfileid || f.published_file_id),
    title: f.title || 'Unknown',
    description: f.description || '',
    previewUrl: f.preview_url,
    author: f.creator,
  }));
}

export async function getWorkshopDetails(ids: string[]): Promise<WorkshopMod[]> {
  if (!STEAM_API_KEY || ids.length === 0) return [];
  const body = new URLSearchParams();
  body.set('itemcount', String(ids.length));
  ids.forEach((id, idx) => body.set(`publishedfileids[${idx}]`, id));

  const res = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    throw new Error(`Steam API error: ${res.status}`);
  }
  const json = await res.json();
  const items = json?.response?.publishedfiledetails || [];
  return items.map((item: any) => ({
    publishedFileId: String(item.publishedfileid),
    title: item.title || 'Unknown',
    description: item.description || '',
    previewUrl: item.preview_url,
    author: item.creator,
  }));
}
