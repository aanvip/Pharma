import { LinkedDocRef } from '../utils/linkedDocuments';

export function LinkedDocsCell({ sos, dcs, invs, onClick, show = { so: true, dc: true, inv: true } }: { sos: LinkedDocRef[]; dcs: LinkedDocRef[]; invs: LinkedDocRef[]; onClick: (d: LinkedDocRef) => void; show?: { so?: boolean; dc?: boolean; inv?: boolean } }) {
  const row = (label: string, docs: LinkedDocRef[], color: string) => (
    <div className="grid grid-cols-[26px_minmax(90px,1fr)] items-center gap-x-1 text-[11px] leading-[15px]">
      <span className="text-gray-500">{label}:</span>
      <div>
        {docs.length === 0 ? (
          <span className="block text-gray-400 text-[11px] leading-[15px]">—</span>
        ) : (
          <div className="space-y-0.5">
            {docs.map((d) => (
              <button
                key={d.id}
                onClick={() => onClick(d)}
                className={`block w-full text-left ${color} hover:underline p-0 m-0 text-[11px] leading-[15px] font-normal whitespace-nowrap`}
                type="button"
                title={d.number}
              >
                {d.number}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-0.5 py-0.5 text-[11px] leading-[15px] min-w-[130px]">
      {show.so !== false && row('SO', sos, 'text-blue-700')}
      {show.dc !== false && row('DC', dcs, 'text-orange-700')}
      {show.inv !== false && row('INV', invs, 'text-blue-700')}
    </div>
  );
}
