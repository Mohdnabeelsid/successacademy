// ==========================================================================
// SUPABASE SERVICE — generic database CRUD helpers & snake_case/camelCase mapper
// ==========================================================================

import { supabase } from "../config/supabase-config.js";

/** Convert camelCase object to snake_case object for database columns */
export function toSnakeCase(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    out[snakeKey] = val;
  }
  return out;
}

/** Convert snake_case object from database to camelCase object for frontend JS */
export function toCamelCase(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    out[camelKey] = val;
  }
  return out;
}

export async function createRow(tableName, data) {
  const dbData = toSnakeCase(data);
  const { data: inserted, error } = await supabase
    .from(tableName)
    .insert([dbData])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return inserted.id;
}

export async function setRowById(tableName, id, data) {
  const dbData = toSnakeCase(data);
  const { error } = await supabase
    .from(tableName)
    .upsert([{ id, ...dbData }]);

  if (error) throw new Error(error.message);
  return id;
}

export async function updateRowById(tableName, id, data) {
  const dbData = toSnakeCase(data);
  const { error } = await supabase
    .from(tableName)
    .update(dbData)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteRowById(tableName, id) {
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function getRowById(tableName, id) {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toCamelCase(data) : null;
}

export async function getAllRows(tableName, { orderByField = "created_at", direction = "desc", max } = {}) {
  const snakeOrder = orderByField.replace(/([A-Z])/g, "_$1").toLowerCase();
  let query = supabase
    .from(tableName)
    .select("*")
    .order(snakeOrder, { ascending: direction === "asc" });

  if (max) query = query.limit(max);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(toCamelCase);
}

export async function getRowsWhere(tableName, field, op, value, extra = {}) {
  const snakeField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
  let query = supabase.from(tableName).select("*");

  switch (op) {
    case "==":
    case "=":
      query = query.eq(snakeField, value);
      break;
    case "!=":
      query = query.neq(snakeField, value);
      break;
    case ">":
      query = query.gt(snakeField, value);
      break;
    case "<":
      query = query.lt(snakeField, value);
      break;
    case "in":
      query = query.in(snakeField, Array.isArray(value) ? value : [value]);
      break;
    default:
      query = query.eq(snakeField, value);
  }

  if (extra.orderByField) {
    const snakeOrder = extra.orderByField.replace(/([A-Z])/g, "_$1").toLowerCase();
    query = query.order(snakeOrder, { ascending: extra.direction === "asc" });
  }

  if (extra.max) {
    query = query.limit(extra.max);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(toCamelCase);
}
