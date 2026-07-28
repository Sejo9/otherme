import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = ["/login", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet: CookieToSet[]) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // `getClaims()` verifies the JWT signature locally against a cached JWKS
  // instead of asking the auth server who you are. `getUser()` costs a network
  // round trip on *every* request — including every RSC prefetch — which was
  // the single largest source of navigation lag.
  //
  // It still refreshes an expired session (a network call, but only then), and
  // it is genuinely verified rather than merely decoded, so it is safe to route
  // on. Real authorisation is RLS in Postgres regardless.
  //
  // NOTE: local verification requires the project to use asymmetric JWT signing
  // keys (Dashboard -> Authentication -> JWT Keys). On a legacy shared-secret
  // project this transparently falls back to a network call, so it is correct
  // either way — just not fast until you migrate.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Static assets, the PWA files, and API routes are all excluded. Route
    // handlers authenticate themselves, so running auth here as well only
    // doubles the cost.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|api/).*)",
  ],
};
