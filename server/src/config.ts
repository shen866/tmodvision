import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/app/.env') });

export const AUTH_TOKEN = process.env.AUTH_TOKEN || 'changeme';
export const PORT = Number(process.env.PORT || 3000);
export const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
export const TMOD_CONTAINER_NAME = process.env.TMOD_CONTAINER_NAME || 'tmodloader';
export const DATA_DIR = process.env.DATA_DIR || '/data';
export const TMOD_DIR = path.join(DATA_DIR, 'tModLoader');
export const MODS_DIR = path.join(TMOD_DIR, 'Mods');
export const WORLDS_DIR = path.join(TMOD_DIR, 'Worlds');
export const BACKUPS_DIR = path.join(TMOD_DIR, 'backups');
export const STEAM_MODS_DIR = path.join(DATA_DIR, 'steamMods');
export const WORKSHOP_DIR = path.join(STEAM_MODS_DIR, 'steamapps', 'workshop', 'content', '1281930');
export const SERVER_CONFIG_PATH = path.join(TMOD_DIR, 'serverconfig.txt');
export const ENABLED_MODS_PATH = path.join(MODS_DIR, 'enabled.json');
export const WORKSHOP_MAP_PATH = path.join(TMOD_DIR, 'workshop-mods.json');
