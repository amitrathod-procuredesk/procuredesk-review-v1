import { describe,it,expect } from "vitest";
import { seedDB } from "../seed";
import { buildInsight,emptyQuery } from "../insights";
import { budgetAvailable } from "../engine";

describe("Ask Insights accuracy",()=>{
  for(const topic of ["invoices","orders","items"] as const) it(`does not invent ${topic} records`,()=>{const r=buildInsight(seedDB(),emptyQuery(topic));expect(r.available).toBe(false);expect(r.rows).toEqual([]);});
  it("matches current budget calculation",()=>{const db=seedDB();const r=buildInsight(db,emptyQuery("budgets"));expect(r.total).toBe(db.budgets.reduce((s,b)=>s+b.total-budgetAvailable(b.id,db),0));});
  it("does not attribute opening budget balances to a user",()=>{const r=buildInsight(seedDB(),{...emptyQuery("budgets"),group:"user"});expect(r.available).toBe(false);});
  it("excludes inventory and declined lines and applies dates and supplier",()=>{const db=seedDB();const request=db.requests[0];db.requests=[request];request.status="approved";request.submittedAt="2026-11-06T00:00:00Z";const l=request.items[0];request.items=[{...l,qty:2,unitPrice:100,tax:10,shipping:5},{...l,id:"stock",fulfillment:"inventory"},{...l,id:"declined",declined:{by:"u_admin",at:"2026-11-06"}}];const q={...emptyQuery("requests"),start:"2026-11-01",end:"2026-11-30",supplier:db.vendors.find(v=>v.id===l.vendorId)?.name??null};expect(buildInsight(db,q).total).toBe(215);expect(buildInsight(db,{...q,start:"2026-12-01"}).total).toBe(0);});
});