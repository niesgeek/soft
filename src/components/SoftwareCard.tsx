import { isDirectDownload, type PublicSoftware } from "../../shared/catalog";
import { Icon } from "./Icon";

export function SoftwareCard({
  item,
  categoryName,
  layout,
}: {
  item: PublicSoftware;
  categoryName?: string;
  layout: "card" | "list";
}) {
  const same = !item.homepage || item.homepage === item.downloadUrl;
  const primaryLabel = same && !isDirectDownload(item.downloadUrl) ? "打开" : "下载";
  return (
    <article className={layout === "list" ? "soft is-list" : "soft"}>
      <div className="soft-main">
        <div className="icon-plate">
          <Icon src={item.icon} name={item.name} />
        </div>
        <div className="soft-copy">
          <div className="soft-title">
            <h3>{item.name}</h3>
            {categoryName ? <span className="soft-cat">{categoryName}</span> : null}
          </div>
          <p className="soft-desc" title={item.description}>
            {item.description}
          </p>
        </div>
      </div>
      <div className="soft-actions">
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
