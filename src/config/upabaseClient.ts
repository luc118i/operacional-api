import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config(); // isso carrega o .env

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL não foi definido no .env");
}

if (!supabaseServiceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY não foi definido no .env");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
