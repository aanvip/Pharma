import { LinkedDocRef } from '../utils/linkedDocuments';

export function LinkedDocsCell({ sos, dcs, invs, onClick }: { sos: LinkedDocRef[]; dcs: LinkedDocRef[]; invs: LinkedDocRef[]; onClick: (d: LinkedDocRef) => void }) {
  const hasAnyDocs = sos.length > 0 || dcs.length > 0 || invs.length > 0;

  const row = (label: string, docs: LinkedDocRef[], color: string) => (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0 text-[11px] leading-4">
      <span className="text-gray-500 font-medium">{label}:</span>
      {docs.map((d) => (
        <button key={d.id} onClick={() => onClick(d)} className={`${color} hover:underline p-0 m-0`} type="button">{d.number}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-0.5 py-0.5">
      {sos.length > 0 && row('SO', sos, 'text-blue-700')}
      {dcs.length > 0 && row('DC', dcs, 'text-orange-700')}
      {invs.length > 0 && row('INV', invs, 'text-blue-700')}
      {!hasAnyDocs && <span className="text-[11px] leading-4 text-gray-400">—</span>}
    </div>
  );
}
