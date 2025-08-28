import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to get user profile
export async function getUserProfile(userId: string) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

  if (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }

  return data;
}

// Helper function to get user by email
export async function getUserByEmail(email: string) {
  const { data, error } = await supabase.from("profiles").select("*").eq("email", email).single();

  if (error) {
    console.error("Error fetching user by email:", error);
    return null;
  }

  return data;
}
