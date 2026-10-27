import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestSchema } from '@/components/d-team/contract';
import { evaluateFixture } from '@/components/d-team/fixtures';
import { SCENARIOS } from '@/components/d-team/scenarios';
export const dynamic='force-dynamic';
const bodySchema=z.object({request:requestSchema,scenario:z.enum(SCENARIOS)}).strict();
export async function POST(request:Request){
  let raw:unknown;
  try{raw=await request.json();}catch{return NextResponse.json({message:'請求必須是 JSON。'},{status:400,headers:{'Cache-Control':'no-store'}});}
  const parsed=bodySchema.safeParse(raw);
  if(!parsed.success)return NextResponse.json({message:'請檢查地點及香港日期時間。'},{status:400,headers:{'Cache-Control':'no-store'}});
  try{
    const result=await evaluateFixture(parsed.data.request,parsed.data.scenario);
    return NextResponse.json({kind:'d-team-fixture-v1',result},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({message:'測試資料暫時無法完成，請重試。'},{status:500,headers:{'Cache-Control':'no-store'}});}
}
