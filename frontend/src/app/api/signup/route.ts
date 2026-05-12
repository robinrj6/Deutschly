import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      password?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim() || null;
    const password = body.password ?? "";

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: "Email already exists." }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);

    await prisma.user.create({
      data: {
        email,
        name,
        password: passwordHash,
      },
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Signup error:", error);
    return Response.json({ error: "Signup failed." }, { status: 500 });
  }
}
