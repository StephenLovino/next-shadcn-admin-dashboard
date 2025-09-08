import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type UpdateProfilePayload = {
  id: string;
  full_name?: string;
  email?: string;
  role?: string;
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: "Server not configured: missing Supabase env vars" },
        { status: 500 }
      );
    }

    // Get caller token
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as UpdateProfilePayload;
    if (!body?.id) {
      return NextResponse.json({ error: "Missing profile id" }, { status: 400 });
    }

    // Validate caller role (owner/admin) using anon client + token
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: getUserError } = await authClient.auth.getUser(token);
    if (getUserError || !userData?.user?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Fetch caller profile
    const { data: callerProfile, error: callerErr } = await serviceClient
      .from("profiles")
      .select("id, role")
      .eq("id", userData.user.id)
      .single();

    if (callerErr || !callerProfile) {
      return NextResponse.json({ error: "Caller profile not found" }, { status: 403 });
    }

    if (!(callerProfile.role === "owner" || callerProfile.role === "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Perform update using service role
    const update: Record<string, unknown> = {};
    if (typeof body.full_name === "string") update.full_name = body.full_name;
    if (typeof body.email === "string") update.email = body.email;
    if (typeof body.role === "string") update.role = body.role;
    update.updated_at = new Date().toISOString();

    let { data: updated, error: updateErr } = await serviceClient
      .from("profiles")
      .update(update)
      .eq("id", body.id)
      .select("id, email, full_name, role, created_at, updated_at");

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    // If nothing was updated by id, try by email as fallback
    if ((updated?.length ?? 0) === 0 && body.email) {
      const fallbackUpdate = { ...update } as Record<string, unknown>;
      delete fallbackUpdate.email; // avoid unique constraint conflicts if email unchanged
      const res = await serviceClient
        .from("profiles")
        .update(fallbackUpdate)
        .eq("email", body.email)
        .select("id, email, full_name, role, created_at, updated_at");
      updated = res.data ?? updated;
      if (res.error) {
        return NextResponse.json({ error: res.error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ data: updated ?? [] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


