"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addEmailList, addInstagram, addRssFeed, runFetchNow, type FormState } from "./actions";

function Status({ state }: { state: FormState }) {
  return (
    <>
      {state.ok && <p className="text-sm text-emerald-700 dark:text-emerald-400 break-all">{state.ok}</p>}
      {state.error && <p className="text-sm text-destructive break-all">{state.error}</p>}
    </>
  );
}

function useResettingForm(action: (prev: FormState, fd: FormData) => Promise<FormState>) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return { state, run, pending, ref };
}

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: React.ReactNode } & React.ComponentProps<"input">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function InstagramForm() {
  const { state, run, pending, ref } = useResettingForm(addInstagram);
  return (
    <form ref={ref} action={run} className="space-y-4">
      <Field id="handle" label="Instagram account" placeholder="@castingcallpro" required />
      <Field
        id="feed"
        label="RSS.app feed link (optional)"
        placeholder="https://rss.app/feeds/AbCd1234.xml"
        hint={
          <>
            Free route: on <a className="underline" href="https://rss.app" target="_blank" rel="noopener noreferrer">rss.app</a> choose New Feed, then
            Instagram, paste the profile link and copy the feed link here (the free plan covers 2 accounts). Leave empty to watch the account through
            the Instagram connection instead.
          </>
        }
      />
      <Button type="submit" disabled={pending}>{pending ? "Adding..." : "Add Instagram account"}</Button>
      <Status state={state} />
    </form>
  );
}

function RssForm() {
  const { state, run, pending, ref } = useResettingForm(addRssFeed);
  return (
    <form ref={ref} action={run} className="space-y-4">
      <Field id="label" label="Name" placeholder="The Stage jobs" />
      <Field id="url" label="Feed link" placeholder="https://example.com/feed.xml" required />
      <Button type="submit" disabled={pending}>{pending ? "Adding..." : "Add feed"}</Button>
      <Status state={state} />
    </form>
  );
}

function EmailForm() {
  const { state, run, pending, ref } = useResettingForm(addEmailList);
  return (
    <form ref={ref} action={run} className="space-y-4">
      <Field id="label" label="List name" placeholder="Spotlight weekly" required />
      <Field
        id="sender"
        label="Sender address (optional)"
        type="email"
        placeholder="news@spotlight.com"
        hint="If you forward these emails from your own inbox, add the sender so the agent can tell lists apart."
      />
      <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create inbound address"}</Button>
      <Status state={state} />
    </form>
  );
}

export function AddSourceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a source</CardTitle>
        <CardDescription>New sources are checked on the next run.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="instagram">
          <TabsList className="mb-4">
            <TabsTrigger value="instagram">Instagram</TabsTrigger>
            <TabsTrigger value="rss">Other RSS feed</TabsTrigger>
            <TabsTrigger value="email">Mailing list</TabsTrigger>
          </TabsList>
          <TabsContent value="instagram"><InstagramForm /></TabsContent>
          <TabsContent value="rss"><RssForm /></TabsContent>
          <TabsContent value="email"><EmailForm /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function RunNowButton() {
  const [state, run, pending] = useActionState<FormState>(runFetchNow, {});
  return (
    <div className="space-y-2">
      <form action={run}>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Checking feeds..." : "Check feeds now"}
        </Button>
      </form>
      <Status state={state} />
    </div>
  );
}
