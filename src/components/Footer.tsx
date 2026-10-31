import { TextLink } from "../lib/router";

export function Footer() {
  return (
    <footer className="site-footer">
      <p>
        装机必备软件合集 · 维护者{" "}
        <a href="https://nie.su" target="_blank" rel="noreferrer">
          涅槃博客
        </a>
      </p>
      <p>
        本站是{" "}
        <a href="https://soft.nie.ge/" target="_blank" rel="noreferrer">
          soft.nie.ge
        </a>{" "}
        的升级版。下载尽量指向各软件的官方页面，安装前请自行核对。
      </p>
      <p>
        <TextLink href="/admin">管理</TextLink>
      </p>
    </footer>
  );
}
