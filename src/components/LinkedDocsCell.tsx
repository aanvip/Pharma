import { LinkedDocRef } from '../utils/linkedDocuments';

export function LinkedDocsCell({ sos, dcs, invs, onClick, show = { so: true, dc: true, inv: true } }: { sos: LinkedDocRef[]; dcs: LinkedDocRef[]; invs: LinkedDocRef[]; onClick: (d: LinkedDocRef) => void; show?: { so?: boolean; dc?: boolean; inv?: boolean } }) {
  const row = (label: string, docs: LinkedDocRef[], color: string) => (
    <div className="grid grid-cols-[30px_1fr] items-start gap-x-1 text-[11px] leading-4">
      <span className="text-gray-500">{label}:</span>
      <div className="min-w-0">
        {docs.length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-x-1">
            {docs.map((d, idx) => (
              <span key={d.id}>
                <button onClick={() => onClick(d)} className={`${color} hover:underline p-0 m-0 text-[11px] leading-4`} type="button">{d.number}</button>
                {idx < docs.length - 1 && <span className="text-gray-400">,</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-0.5 py-0.5 text-[11px] leading-4">
      {show.so !== false && row('SO', sos, 'text-blue-700')}
      {show.dc !== false && row('DC', dcs, 'text-orange-700')}
      {show.inv !== false && row('INV', invs, 'text-blue-700')}
    </div>
  );
}
