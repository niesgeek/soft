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
    <article className="row">
      <div className="icon-plate">
        <Icon src={item.icon} name={item.name} />
      </div>
      <div className="card-copy">
        <div className="card-title">
          <h3>{item.name}</h3>
          {categoryName ? <span className="card-cat">{categoryName}</span> : null}
        </div>
        <p className="card-desc" title={item.description}>
          {item.description}
        </p>
      </div>
      <div className="card-actions">
        <a className="btn ghost" href={item.downloadUrl} target="_blank" rel="noreferrer">
          {primaryLabel}
        </a>
        {!same && item.homepage ? (
          <a className="text-btn" href={item.homepage} target="_blank" rel="noreferrer">
            官网
          </a>
        ) : null}
      </div>
    </article>
  );
}
