import { Action, ActionPanel, Detail, getPreferenceValues, Icon, LaunchProps, List } from "@raycast/api";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// 读取偏好设置
type Preferences = {
  defaultPath: string;
  ignoreName: string;
  showHidden: boolean;
  appAsFile: boolean
}
const preferences: Preferences = getPreferenceValues();

// 加载需要隐藏的文件
let ignoreArr: string[] = [];
preferences.ignoreName.split(',').forEach((name) => {
  ignoreArr.push(name.trim());
});

/**
 * 路径类型，用于更方便的储存一些常用的数据
 * @constructor
 * @param p 路径字符串
 */
class Path {
  public name: string;
  public extension: string;
  public stringPath: string;
  public exists: boolean;
  public isFolder?: boolean;
  constructor(public p: string) {
    this.stringPath = p;
    this.name = path.basename(p);
    this.extension = path.extname(p);
    this.exists = fs.existsSync(p);
    if (this.exists) {
      this.isFolder = fs.statSync(p).isDirectory();
    }
  }

  /**
   * 获取文件图标
   */
  getIcon() {
    if (this.isFolder) {
      return Icon.Folder;
    } else {
      return Icon.Link;
    }
  }
}

/**
 * 加载路径，收集一个字符串路径下包含的所有文件以及目录并返回
 * @param targetPath 目标路径
 */
function loadPath(targetPath: string) {
  let files: Path[] = [];
  let folders: Path[] = [];
  let f = new Path(targetPath);
  // 遍历文件夹
  fs.readdirSync(targetPath).forEach((f) => {
    // 如果要被忽略，那就退出
    if (ignoreArr.indexOf(f) >= 0) {
      return;
    }
    // 如果是.开头的文件或文件夹，说明他是隐藏文件，并且用户没有选择显示隐藏文件，才能隐藏
    if (f.startsWith('.') && !preferences.showHidden) {
      return;
    }
    let newPath = path.join(targetPath, f);
    let pathItem = new Path(newPath);
    if (pathItem.exists) {
      if (pathItem.extension === '.app' && preferences.appAsFile) {
        files.push(pathItem);
      } else {
        if (pathItem.isFolder) {
          folders.push(pathItem);
        } else {
          files.push(pathItem);
        }
      }
    }
  });
  return { f, files, folders };
}

/**
 * 路径不存在错误
 * @param errPath 错误路径
 */
function pathNotExistError(errPath: string) {
  return  (
    <Detail
      markdown={`
# Path \`${errPath}\` does not exist.
    `}
    />
  );
}

/**
 * 路径不是目录错误
 * @param errPath 错误路径
 */
function pathIsFolderError(errPath: string) {
  return (
    <Detail
      markdown={`
# Path \`${errPath}\` is not a folder.
    `}
    />
  );
}

/**
 * 用于进入文件夹
 * @param props 包含一个参数`p`为需要进入的目录路径
 */
function IntoFolder(props: { p: Path }) {
  return (
    <Action.Push
      title={"Into Folder"}
      target={renderList(loadPath(props.p.stringPath))}
    />
  );
}

type folderData = { f: Path, files: Path[], folders: Path[] };

/**
 * 渲染列表，将所有当前目录下的文件以及路径渲染出来，同时绑定事件
 * @param f 当前目录
 * @param files 文件列表
 * @param folders 文件夹列表
 */
function renderList({f, files, folders}: folderData) {
  let fileList;
  if (files.length != 0) {
    fileList = (
      <List.Section title="Files">
        {files.map((f) => <List.Item
          key={f.name}
          title={f.name}
          icon={f.getIcon()}
          actions={
            <ActionPanel>
              <Action.Open target={f.stringPath}  title={`Open ${f.name}`}/>
              <Action.ShowInFinder path={f.stringPath} title={`Show in Finder`}/>
            </ActionPanel>
          }
        />)}
      </List.Section>
    );
  }

  let folderList;
  if (folders.length != 0) {
    folderList = (
      <List.Section title="Folders">
        {folders.map((f) => <List.Item
          key={f.name}
          title={f.name}
          icon={f.getIcon()}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <IntoFolder p={f} />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />)}
      </List.Section>
    );
  }

  return (
    <List navigationTitle={f.stringPath}>
      {fileList}
      {folderList}
    </List>
  );
}

/**
 * 解析路径，用于将 ~/ 转换为当前用户的主目录
 * @param p 需要解析的路径
 */
function resolvePath(p: string) {
  if (p.startsWith('~/')) {
    return path.resolve(os.homedir(), p.slice(2));
  } else {
    return p;
  }
}


export default function Command(props: LaunchProps<{ arguments: Arguments.ViewDir }>) {
  // 读取并预处理输入
  let targetPath = props.arguments.path;
  if (targetPath === '') {
    targetPath = preferences.defaultPath;
  }
  targetPath = resolvePath(targetPath);

  // 报错
  if (!fs.existsSync(targetPath)) {
    return pathNotExistError(targetPath);
  }
  if (!new Path(targetPath).isFolder) {
    return pathIsFolderError(targetPath);
  }

  // 处理并渲染
  return renderList(loadPath(targetPath));
}
