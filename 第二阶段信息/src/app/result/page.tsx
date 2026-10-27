import { DecisionView } from "@/components/DecisionView";
import { tripRequestFromSearchParams } from "@/lib/url-params";

export const dynamic = "force-dynamic";

interface ResultPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toURLSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      search.set(key, value);
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      search.set(key, value[0]);
    }
  }
  return search;
}

export default async function ResultPage({ searchParams }: ResultPageProps) {
  const params = await searchParams;
  const { request, issues } = tripRequestFromSearchParams(toURLSearchParams(params));

  return <DecisionView request={request} paramIssues={issues} />;
}
