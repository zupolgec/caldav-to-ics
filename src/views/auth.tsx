import type { Child, FC } from "hono/jsx";
import { t } from "../lib/i18n";
import { EmailForm } from "./landing";
import { Layout, type PageContext } from "./layout";

const Narrow: FC<{ ctx: PageContext; title: string; children: Child }> = ({ ctx, title, children }) => (
  <Layout ctx={ctx} title={title}>
    <div class="mx-auto flex max-w-lg flex-col gap-5 px-5 py-16 sm:py-24">
      <h1 class="text-4xl font-extrabold tracking-tight">{title}</h1>
      {children}
    </div>
  </Layout>
);

export const LoginPage: FC<{ ctx: PageContext; email?: string; error?: string }> = ({ ctx, email, error }) => {
  const m = t(ctx.locale).auth;
  return (
    <Narrow ctx={ctx} title={m.loginTitle}>
      <p class="leading-relaxed text-ink-soft">{m.loginText}</p>
      <EmailForm locale={ctx.locale} id="email-login" value={email} error={error} />
    </Narrow>
  );
};

export const SentPage: FC<{ ctx: PageContext; email: string }> = ({ ctx, email }) => {
  const m = t(ctx.locale).auth;
  return (
    <Narrow ctx={ctx} title={m.sentTitle}>
      <p class="text-lg leading-relaxed">{m.sentText(email)}</p>
      <p class="leading-relaxed text-ink-soft">
        {m.sentHint}{" "}
        <a class="link" href="/login">
          {m.again}
        </a>
      </p>
    </Narrow>
  );
};

export const VerifyPage: FC<{ ctx: PageContext; email: string; token: string }> = ({ ctx, email, token }) => {
  const m = t(ctx.locale).auth;
  return (
    <Narrow ctx={ctx} title={m.verifyTitle}>
      <p class="text-lg leading-relaxed">{m.verifyText(email)}</p>
      <form method="post" action="/login/verify">
        <input type="hidden" name="token" value={token} />
        <button type="submit" class="btn" autofocus>
          {m.enter}
        </button>
      </form>
    </Narrow>
  );
};

export const InvalidLinkPage: FC<{ ctx: PageContext }> = ({ ctx }) => {
  const m = t(ctx.locale).auth;
  return (
    <Narrow ctx={ctx} title={m.invalidTitle}>
      <p class="leading-relaxed text-ink-soft">{m.invalidText}</p>
      <a class="btn self-start" href="/login">
        {m.again}
      </a>
    </Narrow>
  );
};

export const NotFoundPage: FC<{ ctx: PageContext }> = ({ ctx }) => {
  const m = t(ctx.locale).notFound;
  return (
    <Narrow ctx={ctx} title={m.title}>
      <p class="leading-relaxed text-ink-soft">{m.text}</p>
      <a class="link self-start" href="/">
        {m.home}
      </a>
    </Narrow>
  );
};
