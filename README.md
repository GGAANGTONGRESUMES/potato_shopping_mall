# 감자쇼핑(24.03.25 ~ 24.05.02)

---

서버리스 환경에서 여러 물류센터의 상품 재고를 한 번에 제어할 수 있는 온라인 유통 플랫폼

## 로고

![Untitled](https://github.com/GGAANGTONGRESUMES/potato_shopping_mall/assets/170305464/c829143d-f5db-49de-afdc-abbaa2fd6e45)

<details>
<summary>
  
### 적용 기술
<div markdown="1">
</summary>

| Language | Typescript |
| --- | --- |
| Runtime | Node.js |
| Framework | nestJs |
| Database | mySQL, redis |
| ORM | typeORM |
| Infrastructure | aws ec2(frontend), aws fargate(backend), docker |
| monitoring | log4js |
| test | artillery, JEST |
| 외부 api | 카카오 길찾기 api, 토스페이 위젯 |
| 검색 엔진 | Elasticsearch |
| 프론트엔드 | vue.js |

</div>
</details>

<details>
<summary>

### 서비스 아키텍쳐

<div markdown="1">
</summary>

![서비스 아키텍쳐](https://github.com/GGAANGTONGRESUMES/potato_shopping_mall/assets/170305464/eb75437e-60e2-4314-b5ab-e7d74d21bc3c)

</div>
</details>

<details>
<summary>

### 기술적 의사결정

<div markdown="1">
</summary>

| 분류 | 세부 분류 | 기술 | 결정 사유 |
| ---  | --- | --- | --- |
| 인증 | 로그인 | Oauth2.0 | 고객들이 감자 쇼핑의 서버에 정보를 믿고 맡길 수 없는 것이 당연하다고 생각했다. 그렇기 때문에 더 신뢰할 수 있는 카카오에 개인정보를 제공하고 인증을 맡기는 법. 또한, 가능성은 낮지만 언젠가 모종의 방법으로 회원 가입 시 대량의 더미 아이디를 생성하여 허위 주문/결제 정보를 생성하는 식의 공격이 이뤄질 가능성이 있다고 판단하였다. 위의 사유로 인해 홈쇼핑 툴에서 자체적으로 로그인 인증을 하는 대신, 이미 검증된 보안과 인증 역량을 갖춘 소셜 미디어 로그인 기능을 도입하였다. |
| 서버 배포 | CD | ECS/AWS Fargate | ‘감자 쇼핑’은 온라인 홈쇼핑을 개설하기 원하는 다양한 사용자를 포용할 수 있도록 설계된 일종의 플랫폼이다. 따라서 사용자는 감자 쇼핑 툴을 사용하면서 쌓인 유저 경험을 바탕으로 자신들에게 맞게 세부 사항을 수정해 나가려는 욕구가 강할 것으로 추정하였다.감자 쇼핑은 이러한 소비자들의 욕구를 부담없이 충족할 수 있도록 ‘무중단 배포’ 기술을 도입하였다. ECS의 AWS Fargate를 선택한 이유는 크게 두가지이다. 1. EKS와 달리 ECS는 AWS에서 무중단 배포에 필요한 세부 사항들(auto scale 등)을 자동 조정해준다. 감자 쇼핑 툴 소비자들에게 필요한 기술 지원을 쉽고 효과적으로 해줄 수 있다. 2. AWS Fargate는 EC2와 달리 서버리스 환경에서 동작하기 때문에 자동으로 scale in& scale out이 이루어진다. 이는 소비자들이 자신이 보유한 쇼핑몰의 이용자 상황에 따라 낭비 없이 서버를 이용할 수 있도록 도와준다. 3. 도커를 이용해서 배포한다는 점도 매력적이다. 도커로 띄우면 어떤 운영체제 하에서 작동시키더라도 똑같은 환경의 서버를 띄울 수 있다. 4. eks는 러닝커브가 너무 높아 짧은 프로젝트 기간을 감안했을 때 선택할 수 없었다. |
| PG 시스템 | PG 시스템 | 토스 페이 | 계약 없이 테스트 키 만으로도 PG시스템 구현이 가능한 것으로 파악되어서 토스 페이를 선택하였다. |
| 서버 배포 | CI | Husky/Git Action | 지속적 배포를 할 때 필요한 코드 통일성 검사를 자동으로 수행하기 위해 Husky를 선택했고, CD를 위한 코드 안정성 검사를 위해 Git Aciton.을 활용하여 CI를 수행하고자 하였다. 하지만 프로젝트 일정에 쫓겨 점점 테스트 코드 작성이 실제 비즈니스 코드 진행에 비해 늦어지기 시작했다. 팀원들과의 논의 끝에 일단은 프로젝트를 완성하는 것이 먼저이기에 일단 CI를 포기하기로 하였다. 보완 시기에 테스트코드를 다 작성하면서 구현해볼 예정이다.  |
| 보안 | https | https | 클라이언트와 서버 사이에서 민감한 정보가 오고가야 하는 쇼핑몰의 특성상 http 프로토콜을 단독으로 사용하는 것은 보안상 바람직하지 않다고 판단하여 https를 도입하고자 하였다. 다만, 프로젝트 일정에 쫓겨 https를 적용하지 못했지만, 보완 시기에 aws route53을 적용해 볼 예정이다. |
| 데이터베이스 | DB | MySQL | 사용하기 편하고, 신뢰성이 높으며 데이터 보호 능력이 우수하다. 특히 쇼핑몰은 READ 요청의 비율이 압도적으로 높을 수 밖에 없는데, MySQL은 READ에서 탁월한 강점을 보인다는 점이 MySQL을 고른 주된 이유였다. |
| 데이터베이스 | In-Memory DB | Redis | REDIS는 처리 속도가 빠르고, 컴퓨터의 In-Memory 영역에 존재하기 때문에 서버의 부하를 분산해줄 수 있기에 선택하였다. 다만, 후술할 elasticSearch에서 감자쇼핑의 프로젝트 수준에 필요한 캐싱 기능이 있었기 때문에 Redis는 refreshToken의 캐싱 기능과 redlock 동시성 처리만을 담당하게 되었다. |
| 동시성 처리 | 동시성 처리 | Redlock | 결제 과정에서 발생할 수 있는 동시성 문제로 인한 모순을 방지하기 위해 도입하였다.  |
| 검색엔진 | Search Engine | ElasticSearch | DB 마이그레이션을 통해 DB를 직접 조회하지 않고 데이터를 반환할 수 있어 매우 빠른 속도와 안정성을 보여준다. 또한, 강력한 색인 기능을 통해 특정 단어가 포함된 문서를 검색할 수 있으며, 문서가 정형화 되어 있지 않아도 검색이 가능하다. 니즈가 항상 명확하지 않을 수 있는 소비자들도 손쉽게 자신이 원하는 것을 찾아갈 수 있도록 하기 위에 도입하였다.   |
| 이미지 업로드 | CDN | Cloud Front | 웹 사이트 로딩 속도를 개선하고, 서버 비용을 절감할 수 있으며, 안정적인 컨텐츠 제공이 가능하기에 선택하였다. |
| 이미지 저장소 | Storage | Amazon S3 | 러닝 커브가 짧고, 요금이 저렴하며, 내구성이 높기에 채택하였다. |
| 모니터링 | logging | log4js | 로깅의 6레벨 별로 상세하게 출력될 데이터 형식, append를 설정할 수 있고, 추가로 필요하면 커스텀 로깅 레벨도 구현할 수 있는 유연성을 갖추고 있기에 선택하였다. |
| 유닛 테스트 | 테스트 코드 | JEST | JavaScript/TypeScript 환경에 최적화 돼있어서 테스트 코드를 작성하기 수월하기 때문에 선택하였다. 우리의 역량 부족으로 인해 비즈니스 로직과 테스트 코드를 모두 완성할 시간이 부족했다. 최종 프로젝트를 실제 계약이라고 생각한다면, 일단 프로젝트를 완성한 후에 사실대로 클라이언트에게 보고하고 보완을 모색하는 것이 맞다고 생각했다. 팀원들과 상의하여 테스트 코드를 일단 포기하고, 제출 후 보완 시기에 테스트 코드를 수정하기로 하였다.  |
| 부하 테스트 | 부하 테스트 | Artillery | NodeJS 환경에 최적화돼 있고, 복잡하지 않은 간단한 테스트에 적합하다. 무엇보다도 다른 특별한 의존성 없이 CLI 환경에서 작동이 가능한 편의성 때문에 선택하였다. local test를 통해 테스트 로직을 구현한 후, Artillery 부하 테스트를 위해 45만개의 더미 데이터를 rds에 삽입하였다. 하지만 원인을 알 수 없는 nodeJS 내부 문제가 발생하여 aws fargate에 서버를 띄운 상태에서는 테스트를 하지 못했다. 이 역시 보완 시기에 다시 시도해 볼 예정이다. |

</div>
</details>

<details>
<summary>

### ERD(핵심 테이블 요약)

<div markdown="1">
</summary>

![erd-생략](https://github.com/GGAANGTONGRESUMES/potato_shopping_mall/assets/170305464/b98cbb74-cd02-4a55-a0f1-516d7be8879d)


전체 ERD 링크: [https://www.erdcloud.com/d/9NfxQfQ8xARCSyLx9](https://www.erdcloud.com/d/9NfxQfQ8xARCSyLx9)

</div>
</details>

<details>
<summary>

### **기능 구현**

<div markdown="1">
</summary>

- aws fargate를 활용해 서버리스 환경하 서버 관리 기능
구현
- 카카오톡을 통한 Oauth2.0 인증 구현(로그인/회원가입 일체)
- 토스페이 위젯을 활용하여 PG 결제 시스템 구현
- WMS 물류 관리 시스템 구현(상품/재고/RACK/창고)
- 카카오 길찾기 api를 통해 좌표기반 배송관리 기능 구현
- log4js를 활용하여 로깅 기능 구현
- Elasticsearch를
- 리뷰/코멘트 CRUD 구현

</div>
</details>

<details>
<summary>

### **트러블 슈팅**

<div markdown="1">
</summary>

1. **PG 시스템 - 갑작스런 결제 시도 중단 시 재결제 시도 불가능 문제 해결**
    - **문제점**
        - 결제가 갑작스럽게 중단된 경우 결제 인증 요청 api에
        다시 접근하면 감자 쇼핑 측 order id로 인해 고유키 에
        러가 발생
    - **해결책**
        - 감자쇼핑 측 order id에 대한 데이터가 DB에 존재하는
        지 유효성 검사를 실시하여 존재하면 추가로 생성하지
        않고 해당 데이터를 사용하도록 함
        - [최종프로젝트#21. 트러블 슈팅 - PG 시스템(1)
        (velog.io)](https://velog.io/@qkrds0914/%EC%B5%9C%EC%A2%85%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B821.-%ED%8A%B8%EB%9F%AC%EB%B8%94-%EC%8A%88%ED%8C%85-PG-%EC%8B%9C%EC%8A%A4%ED%85%9C)
2. **PG 시스템 - 브라우저 두 개로 중복 결제 시도 가능한 리스크 해결**
    - **문제점**
        - '트러블슈팅1'의 해결 방법으로 인해 브라우저 2개를
        동시에 열어놓고 결제를 요청할 경우 중복 결제 요청이
        가능할 수 있다는 리스크가 발견됨
    - 해결책
        - 승인 요청 api에 최초 승인 요청인지 여부를 판단하는
        유효성 검사로직을 추가해 최초 승인 요청일 경우 정상
        적으로 통과시키고, 그렇지 않을 경우 에러를 반환하도
        록 함
        - [https://velog.io/@qkrds0914/최종-프로젝트22.-트러블-슈팅-mySQL-raw-query](https://velog.io/@qkrds0914/%EC%B5%9C%EC%A2%85-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B822.-%ED%8A%B8%EB%9F%AC%EB%B8%94-%EC%8A%88%ED%8C%85-mySQL-raw-query)
3. **WMS 시스템 - 복수의 물류센터 중 적절한 배송 출발점을 선정하는 로직 구현**
    - 문제점
        - 한 상품의 재고가 다수의 물류센터에 존재할 수 있었기
        에 물류센터 배송 할당 로직이 필요하게 됨
    - 해결책
        - 감자처럼 든든한 개발자, 박대수 4
        배송지에서 가장 가까운 물류센터에 할당하기로 함, 카
        카오 길찾기 API의 도로거리 계산 기능을 사용해 구현
        함
        - [https://velog.io/@qkrds0914/최종-프로젝트24.-트러블-슈팅-배송-출발점-선정-로직-카카오-길찾기-api](https://velog.io/@qkrds0914/%EC%B5%9C%EC%A2%85-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B824.-%ED%8A%B8%EB%9F%AC%EB%B8%94-%EC%8A%88%ED%8C%85-%EB%B0%B0%EC%86%A1-%EC%B6%9C%EB%B0%9C%EC%A0%90-%EC%84%A0%EC%A0%95-%EB%A1%9C%EC%A7%81-%EC%B9%B4%EC%B9%B4%EC%98%A4-%EA%B8%B8%EC%B0%BE%EA%B8%B0-api)
4. **DB보안 & 이용자 신뢰 - 인증과 관련한 잠재적 보안 위협에 대한 대응책을 고민함**
    - 문제점
        - 소비자가 감자쇼핑을 믿고 개인정보를 제공할 수 있을지
        확신이 없었음
        - 신입 개발자로서 과연 웹서비스가 충분한 수준의 보안을
        제공하도록 설계했는지 자신할 수 없었음
    - 해결책
        - Oauth2.0(카카오)을 회원가입/로그인에 모두 도입한
        후 자체 인증 기능을 제거함
5. **AWS ECS 연결 문제 - AWS 자격 증명 저장 과정에서의 리스크 해결**
- 문제점
    - 깃허브 CD를 위해 aws ecs의 자격증명 인증용 변수를 저장하는 것이 민감한 정보를 노출할 위험을 증가하여 보안 취약점을 야기할 수 있음이 발견
- 해결책
    - 환경변수를 aws의 secret manager에 등록하여 보안을 강화함
    - aws OIDC를 토큰을 발급한 뒤 이를 통해 깃허브에서 aws 인증 수행
        
        
1. **Elasticsearch - migrate 되는 데이터 중 중복된 데이터가 update 대신 insert 되는 문제 해결**
- 문제점
    - 색인이 제대로 설정돼 있지 않았던 것이 원인
- 해결책
    - db의 goods id와 Elasticsearch의 goods_id가 동기화되도록 설정함
1. **Elasticsearch - 재고 정보가 실시간으로 변경되어 불필요한 migration이 발생하는 문제 해결**
- 문제점
    - 재고 정보가 숫자 그대로 노출되도록 설계했던 점 때문에 구매/환불이 발생할 때마다 migration이 발생하였음
- 해결책
    - 재고정보 노출 관련 내부정책을 수정하여 [재고 있음/ 재고 없음]을 송출하도록 변경함
 
</div>
</details>
