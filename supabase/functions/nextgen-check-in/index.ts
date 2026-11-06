// ==========================================================================
// SUPABASE EDGE FUNCTION: nextgen-check-in
// Handles public student check-in, verifies active live session,
// inserts attendee record safely, and returns Google Meet URL.
// ==========================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function normalizeIndianPhone(phone: string): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  return null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const { studentName, classLevel, schoolName, phone } = body;

    // 1. Validation
    const cleanName = String(studentName || "").trim();
    if (cleanName.length < 2) {
      return new Response(
        JSON.stringify({ error: "Student name must be at least 2 characters long." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cls = Number(classLevel);
    if (![8, 9, 10, 11, 12].includes(cls)) {
      return new Response(
        JSON.stringify({ error: "Class must be between 8 and 12." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanSchool = String(schoolName || "").trim();
    if (cleanSchool.length < 2) {
      return new Response(
        JSON.stringify({ error: "School name must be at least 2 characters long." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normPhone = normalizeIndianPhone(phone);
    if (!normPhone) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid 10-digit Indian mobile number." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Initialize Supabase Admin Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Find currently LIVE NEXTGEN session
    const { data: liveSession, error: sessionErr } = await supabase
      .from("nextgen_sessions")
      .select("id, title, meet_url, status")
      .eq("status", "live")
      .maybeSingle();

    if (sessionErr || !liveSession) {
      return new Response(
        JSON.stringify({ error: "There is currently no live NEXTGEN session. Check-in is closed." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Record Check-In
    const attendeePayload = {
      session_id: liveSession.id,
      student_name: cleanName,
      class_level: cls,
      school_name: cleanSchool,
      phone: String(phone).trim(),
      phone_normalized: normPhone,
      submitted_at: new Date().toISOString()
    };

    const { data: inserted, error: insErr } = await supabase
      .from("nextgen_attendees")
      .upsert(attendeePayload, {
        onConflict: "session_id,phone_normalized,student_name"
      })
      .select()
      .single();

    if (insErr) {
      return new Response(
        JSON.stringify({ error: insErr.message || "Failed to record check-in." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Return meet URL upon success
    return new Response(
      JSON.stringify({
        success: true,
        sessionId: liveSession.id,
        sessionTitle: liveSession.title,
        meetUrl: liveSession.meet_url,
        attendeeId: inserted?.id,
        message: "Check-in successful! Redirecting to Google Meet..."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

