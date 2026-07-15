import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface Props {
  content: string;
  className?: string;
}

const components: Components = {
  a({ href, children }) {
    const url = href ?? "#";
    // Only allow http(s) and mailto in rendered links
    const safe =
      /^https?:\/\//i.test(url) || /^mailto:/i.test(url) ? url : undefined;
    if (!safe) {
      return <span className="md-link-blocked">{children}</span>;
    }
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    if (!src || !/^https?:\/\//i.test(src)) {
      return alt ? <span className="md-img-alt">{alt}</span> : null;
    }
    return (
      <img
        src={src}
        alt={alt ?? ""}
        className="md-img"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  },
  // Avoid nested <pre><pre> quirks; style via CSS
  pre({ children }) {
    return <pre className="md-pre">{children}</pre>;
  },
  code({ className, children, ...props }) {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="md-inline-code" {...props}>
        {children}
      </code>
    );
  },
};

/**
 * Safe-ish chat markdown (no raw HTML plugin). GFM tables/lists/strikethrough.
 */
export function MarkdownBody({ content, className }: Props) {
  const text = content ?? "";
  if (!text.trim()) return null;

  return (
    <div className={className ? `md-body ${className}` : "md-body"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
