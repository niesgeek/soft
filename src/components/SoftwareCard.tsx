import { isDirectDownload, type PublicSoftware } from "../../shared/catalog";
import { Icon } from "./Icon";

export function SoftwareCard({
  item,
  categoryName,
}: {
  item: PublicSoftware;
  categoryName?: string;
}) {
  const same = !item.homepage || item.homepage === item.downloadUrl;
  const primaryLabel = same && !isDirectDownload(item.downloadUrl) ? "打开" : "下载";
  return (
    <article className="card">
      <div className="card-top">
        <div className="icon-plate">
          <Icon src={item.icon} name={item.name} />
        </div>
        <div className="card-copy">
          <h3>{item.name}</h3>
          {categoryName ? <p className="card-cat">{categoryName}</p> : null}
          <p className="card-desc">{item.description}</p>
        </div>
      </div>
      <div className="card-actions">
        <a className="btn primary" href={item.downloadUrl} target="_blank" rel="noreferrer">
          {primaryLabel}
        </a>
        {!same && item.homepage ? (
          <a className="btn ghost" href={item.homepage} target="_blank" rel="noreferrer">
            官网
          </a>
        ) : null}
      </div>
    </article>
  );
}
