import { instagramStatus } from "@/lib/instagram";
import { createAdminClient } from "@/lib/supabase/admin";
import { disconnectInstagramAction } from "./instagram-actions";
import { InstagramConnectForm } from "./instagram-connect";

// Status, setup guide and connect form for the official Instagram connection.
export async function InstagramPanel() {
  const status = await instagramStatus(createAdminClient());
  const until =
    status.state === "on" && status.expiresAt
      ? new Date(status.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
      : null;

  return (
    <section className="glass space-y-5 rounded-[28px] p-5 md:p-6">
      <div>
        <h2 className="font-serif text-2xl">Instagram</h2>
        <p className="text-sm text-ink-soft">
          Reads castings straight from any number of public Instagram accounts (casting directors, theatres, agencies). Add accounts to watch under
          Sources, Instagram.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="glass-chip inline-flex rounded-full px-3 py-1.5 text-sm">
          {status.state === "on"
            ? `Connected as @${status.username}${until ? `, renew by ${until}` : ""}.`
            : status.state === "error"
              ? `Connection problem: ${status.error}`
              : "Not connected yet."}
        </p>
        {status.state !== "off" && (
          <form action={disconnectInstagramAction}>
            <button type="submit" className="text-xs text-ink-soft underline-offset-4 hover:underline">Disconnect</button>
          </form>
        )}
      </div>

      {status.state !== "on" && (
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>In the Instagram app: Settings, Account type and tools, switch to a free <span className="font-medium">Creator</span> account.</li>
          <li>On Facebook, create a Page (it can stay empty) and link that Instagram account to it in the Page settings, under Linked accounts.</li>
          <li>
            Go to <a className="underline" href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps</a>,
            create an app (choose Business), and add the Instagram product (API setup with Facebook login). Copy the App ID and, from App settings,
            Basic, the App secret.
          </li>
          <li>
            Open the <a className="underline" href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">Graph API Explorer</a>,
            pick your app, add the permissions instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement and business_management,
            then press Generate Access Token and copy it.
          </li>
          <li>Paste the three below and press Connect.</li>
        </ol>
      )}

      <InstagramConnectForm reconnect={status.state !== "off"} />

      <p className="text-xs text-ink-soft">
        Only public business and creator accounts can be read. Personal accounts, stories and messages are private. The connection lasts about 60 days;
        reconnect here when it says to.
      </p>
    </section>
  );
}
