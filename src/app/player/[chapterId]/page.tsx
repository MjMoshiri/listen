import { notFound } from 'next/navigation';
import Reader from '@/components/Reader/Reader';
import { getPlayerData } from '@/lib/player-data';

export const dynamic = 'force-dynamic';

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const { chapterId } = await params;
  const data = await getPlayerData(chapterId);
  if (!data) notFound();
  return <Reader initial={data} />;
}
