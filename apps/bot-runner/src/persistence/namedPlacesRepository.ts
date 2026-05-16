import type { SqliteDb } from "./sqliteDb.js";

export type PlaceType = "home" | "landmark" | "resource" | "danger";

export type NamedPlace = {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  placeType: PlaceType;
  claimedBy: string | null;
  createdAt: number;
};

type PlaceRow = {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  place_type: string;
  claimed_by: string | null;
  created_at: number;
};

function rowToPlace(row: PlaceRow): NamedPlace {
  return {
    id: row.id,
    name: row.name,
    x: row.x,
    y: row.y,
    z: row.z,
    radius: row.radius,
    placeType: row.place_type as PlaceType,
    claimedBy: row.claimed_by ?? null,
    createdAt: row.created_at
  };
}

export function createNamedPlacesRepository(db: SqliteDb) {
  function upsert(place: Omit<NamedPlace, "id" | "createdAt">): NamedPlace {
    const existing = findByName(place.name);
    if (existing) {
      db.prepare(`
        UPDATE named_places SET x = ?, y = ?, z = ?, radius = ?, place_type = ?, claimed_by = ? WHERE name = ?
      `).run(place.x, place.y, place.z, place.radius, place.placeType, place.claimedBy, place.name);
      return { ...existing, ...place };
    }
    const result = db.prepare(`
      INSERT INTO named_places (name, x, y, z, radius, place_type, claimed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(place.name, place.x, place.y, place.z, place.radius, place.placeType, place.claimedBy, Date.now());
    return { ...place, id: result.lastInsertRowid as number, createdAt: Date.now() };
  }

  function findByName(name: string): NamedPlace | undefined {
    const row = db.prepare("SELECT * FROM named_places WHERE name = ?").get(name) as PlaceRow | undefined;
    return row ? rowToPlace(row) : undefined;
  }

  function findByType(placeType: PlaceType): NamedPlace[] {
    const rows = db.prepare("SELECT * FROM named_places WHERE place_type = ?").all(placeType) as PlaceRow[];
    return rows.map(rowToPlace);
  }

  function findHome(): NamedPlace | undefined {
    return findByType("home")[0];
  }

  function findAll(): NamedPlace[] {
    const rows = db.prepare("SELECT * FROM named_places").all() as PlaceRow[];
    return rows.map(rowToPlace);
  }

  function remove(name: string): void {
    db.prepare("DELETE FROM named_places WHERE name = ?").run(name);
  }

  return { upsert, findByName, findByType, findHome, findAll, remove };
}

export type NamedPlacesRepository = ReturnType<typeof createNamedPlacesRepository>;
