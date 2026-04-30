import { LinkedDocRef } from '../utils/linkedDocuments';

export function LinkedDocsCell({ sos, dcs, invs, onClick }: { sos: LinkedDocRef[]; dcs: LinkedDocRef[]; invs: LinkedDocRef[]; onClick: (d: LinkedDocRef) => void }) {
  const row = (label: string, docs: LinkedDocRef[], color: string) => (
    <div className="flex items-center gap-1 text-xs leading-5">
      <span className="text-gray-500">{label}:</span>
      {docs.length ? docs.map((d) => (
        <button key={d.id} onClick={() => onClick(d)} className={`px-1.5 py-0.5 rounded bg-gray-50 ${color} hover:underline`} type="button">{d.number}</button>
      )) : <span className="text-gray-400">—</span>}
    </div>
  );
  return <div className="space-y-0.5">{row('SO', sos, 'text-blue-700')}{row('DC', dcs, 'text-orange-700')}{row('INV', invs, 'text-green-700')}</div>;
}
